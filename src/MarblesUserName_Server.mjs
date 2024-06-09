// Node Server that manages, saves and processes images for MarblesNameGrabber

import path from 'node:path'
import { spawn } from 'node:child_process'
import axios from 'axios'
import fs from 'fs/promises'

import {MarbleNameGrabberNode} from "./MarblesNameGrabberNode.mjs"
import {UsernameTracker} from './UsernameTrackerClass.mjs'

import { createWorker, createScheduler } from 'tesseract.js'
import { humanReadableTimeDiff } from './DataStructureModule.mjs'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
// import { setInterval } from 'node:timers'
import { setTimeout } from 'node:timers/promises'

// server state
const SERVER_STATE_ENUM = {
    STOPPED: 'STOPPED', // Server has stopped reading or hasnt started reading
    WAITING: 'WAITING', // Server is waiting for the load screen
    READING: 'READING', // Server is currently performing OCR and reading
    COMPLETE: 'COMPLETE'// Server has completed reading, usernames are stored
}

const TWITCH_URL = 'https://www.twitch.tv/'
const DEBUG_URL = 'https://www.twitch.tv/videos/1891700539?t=2h30m20s' 
                // "https://www.twitch.tv/videos/1895894790?t=06h39m40s"
                // "https://www.twitch.tv/videos/1914386426?t=1h6m3s"
                // start/videos/1938079879?t=4h55m20s       // no chat box; 29/9
                // /videos/2134416841?t=6h7m3s
const LIVE_URL = 'https://www.twitch.tv/barbarousking'
let defaultStreamURL = LIVE_URL
// const streamlinkCmd = ['streamlink', defaultStreamURL, 'best', '--stdout']

let ffmpegFPS = '3'
// const ffmpegCmd = ['ffmpeg', '-re', '-f','mpegts', '-i','pipe:0', '-f','image2pipe', '-pix_fmt','rgba', '-c:v', 'png', '-vf',`fps=fps=${ffmpegFPS}`, 'pipe:1']

const PNG_MAGIC_NUMBER = 0x89504e47 // Number that identifies PNG file
const PNG_IEND_CHUNK = 0x49454E44

const NUM_LIVE_WORKERS = 6 // Num Tesseract workers
const WORKER_RECOGNIZE_PARAMS = {
    blocks:true, hocr:false, text:false, tsv:false
}
const TEST_FILENAME = "testing/test.png"
const LIVE_FILENAME = "testing/#.png"
const VOD_DUMP_LOC = "testing/vod_dump/"
const EMPTY_PAGE_COMPLETE = 5 * parseInt(ffmpegFPS)   // number of frames* without any valid names on them

let TWITCH_ACCESS_TOKEN_BODY = null
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
const TWITCH_CHANNEL_INFO_URL = "https://api.twitch.tv/helix/channels"
const TWITCH_DEFAULT_BROADCASTER = "barbarousking" // Default twitch channel
const TWITCH_DEFAULT_BROADCASTER_ID = "56865374" // This is the broadcaster_id for barbarousking
const TWITCH_CRED_FILE = 'twitch_creds.json'

const AWS_LAMBDA_CONFIG = { region: 'us-east-1'}
const USE_LAMBDA = false
const NUM_LAMBDA_WORKERS = 12 // Num Lambda workers

// TODO: Get value from streamlink config
// Needs to handle both linux for prod and windows for dev
const FFMPEG_LOC = String.raw`C:\Program Files\Streamlink\ffmpeg\ffmpeg.exe` // NOTE: should work on all streamlink installations

export class MarblesAppServer {
    
    constructor () {
        this.serverStatus = {
            state: SERVER_STATE_ENUM.STOPPED,   // current state
            imgs_downloaded: 0,                 // downloaded images from the stream
            imgs_read: 0,                       // images read from stream (that are valid marbles names)
            started_stream_ts: null,            // how long the program has ingested data
            ended_stream_ts: null,              // when stream ingest ended
            viewers: 0,                         // current viewers on the site
            interval: 1_000 * 3                 // interval to refresh status
        }

        // debug variables
        this.debugTesseract = false;
        this.debugProcess = false;
        this.debugLambda = false;
        this.debugVODDump = false;
        this.enableMonitor = false;

        // Processors & Commands
        this.streamlinkCmd = ['streamlink', defaultStreamURL, 'best', '--stdout']   // Streamlink shell cmd
        this.ffmpegCmd = [FFMPEG_LOC, '-re', '-f','mpegts', '-i','pipe:0', '-f','image2pipe', '-pix_fmt','rgba', '-c:v', 'png', '-vf',`fps=${ffmpegFPS}`, 'pipe:1']
        this.streamlinkProcess = null   // Node process for streamlink
        this.ffmpegProcess = null       // Node process for ffmpeg
        this.pngChunkBufferArr = []     // Maintained PNG buffer over iterations

        // Tesseract variables
        this.OCRScheduler = null
        this.numOCRWorkers = 0

        this.usernameList = new UsernameTracker()   // Userlist
        this.emptyListPages = 0 // Number of images without any names

        // Twitch tokens
        this.twitch_access_token = null
        this.game_type_monitor_interval = null
        this.broadcaster_id = TWITCH_DEFAULT_BROADCASTER_ID
        this.last_game_name = null

        this.monitoredViewers = [] // keep track of viewers on website

        // Lambda state
        if (this.debugLambda)  AWS_LAMBDA_CONFIG["logger"] = console
        // this.lambdaClient = new LambdaClient(AWS_LAMBDA_CONFIG)
        this.uselambda = USE_LAMBDA
        this.lambdaClient = null
        this.lambdaQueue = 0    // Keep track of images sent to lambda for processing
        
        this.imageProcessQueue = []    // Queue for image processing
        this.imageProcessQueueLoc = 0    // Where the first element of imageProcessQueue points to
        this.imageProcessId = 0          // Current id for image

        // Start up the Twitch game monitor
        if (this.enableMonitor)
            this.setupTwitchMonitor()
    }

    // ---------------
    // Declaring general functions
    // ---------------

    /**
     * Setup schedulers & workers for OCR reading
     * @param {Number} workers 
     * @returns {Promise}
     */
    async setupWorkerPool (workers=1) {
        if (this.OCRScheduler == null)
            this.OCRScheduler = createScheduler()

        let promList = []
        while (this.numOCRWorkers < workers) {
            promList.push(this.addOCRWorker(this.numOCRWorkers++))
        }
        
        if (promList.length == 0) return Promise.resolve(true) // TODO: Worker list of something
        return Promise.any(promList)
    }

    /** Terminate workers in scheduler */
    async shutdownWorkerPool () {
        this.numOCRWorkers = 0
        return this.OCRScheduler.terminate()
        // TODO: Change this to just terminate some workers?
    }

    /** Warmup lambda by sending an empty file */
    async warmupLambda (workers) {
        // Im throwing away lambdaClient, dont know if this is recommened
        this.lambdaClient = new LambdaClient(AWS_LAMBDA_CONFIG)

        let lambda_id=0
        while (lambda_id < workers) {
            this.sendWarmupLambda(`warmup ${lambda_id++}`)
        }
    }

// -------------------------
// Server processing functions
// -------------------------
    /**
     * Start downloading channel or vod to read
     * Note this also setups variables assuming a state changing going to START
     * @param {String} twitch_channel 
     * @returns 
     */
    startStreamMonitor(twitch_channel=null) {
        // Start process for stream url

        if (this.streamlinkProcess) return // TODO: Return error

        // Setup variables
        this.emptyListPages = 0
        this.serverStatus.state = SERVER_STATE_ENUM.WAITING
        
        // reset image queue
        this.imageProcessId = 0
        this.imageProcessQueueLoc = 0
        this.imageProcessQueue = []


        if (twitch_channel)
            this.streamlinkCmd[1] = TWITCH_URL + twitch_channel
        else
            this.streamlinkCmd[1] = defaultStreamURL

        console.debug(`Starting monitor in directory: ${process.cwd()}`)
        console.debug(`Watching stream url: ${this.streamlinkCmd[1]}`)

        this.streamlinkProcess = spawn(this.streamlinkCmd[0], this.streamlinkCmd.slice(1), {
            stdio: ['inherit', 'pipe', 'pipe']
        })
        this.ffmpegProcess = spawn(this.ffmpegCmd[0], this.ffmpegCmd.slice(1), {
            stdio: ['pipe', 'pipe', 'pipe']
        })

        this.streamlinkProcess.stdout.pipe(this.ffmpegProcess.stdin) // pipe to ffmpeg

        
        // On Streamlink start, make log to request
        if (this.debugProcess) {
            this.streamlinkProcess.stderr.on('data', (data) => {
                console.log(data.toString())
            })
        } else {
            let outputBuffer = false
            this.streamlinkProcess.stderr.on('data', (data) => {
                const stringOut = data.toString()
                // FIXME: Output error when stream is unavailable
                if (!outputBuffer & stringOut.includes('Opening stream')) {
                    outputBuffer = true
                    console.debug('Streamlink is downloading stream-')
                }
            })
        }

        // On FFMpeg start, make log
        if (this.debugProcess) {
            this.ffmpegProcess.stderr.on('data', (data) => {
                console.log(data.toString())
            })
        } else {
            let outputBuffer = false
            this.ffmpegProcess.stderr.on('data', (data) => {
                const stringOut = data.toString()
                if (!outputBuffer & stringOut.includes('frame=')) {
                    outputBuffer = true
                    console.debug('FFMpeg is outputting images to buffer-')
                }
            })
        }

        this.ffmpegProcess.stdout.on('data', (partialPngBuffer) => {
            // NOTE: Data is a buffer with partial image data
            
            this.pngChunkBufferArr.push(partialPngBuffer)
            // PNG chunk is 12 BYTES (but since length is 0, first 4 bytes are 0)
            if (partialPngBuffer.readUInt32BE(partialPngBuffer.length-8) == PNG_IEND_CHUNK) {
                // close png
                const pngBuffer = Buffer.concat(this.pngChunkBufferArr)
                this.pngChunkBufferArr.length = 0 // clear array
                this.parseImgFile(pngBuffer)
            }

        })

        this.streamlinkProcess.on('error', (err) => {
            console.warn("An unknown error occurred while writing Streamlink process." + err)
        })
        this.ffmpegProcess.on('error', () => {
            console.warn("An unknown error occurred while writing FFMpeg process.")
        })

        this.streamlinkProcess.on('close', () => {
            console.debug('Streamlink process has closed.')
            this.spinDown()
            this.serverStatus.state = SERVER_STATE_ENUM.STOPPED
        })
        this.ffmpegProcess.on('close', () => {
            console.debug('FFMpeg process has closed.')
            this.serverStatus.state = SERVER_STATE_ENUM.STOPPED
        })

        console.debug("Started up streamlink->ffmpeg buffer")
    }

    /**
     * Shutdown streamlink & ffmpeg processes
     * @returns {Boolean} wasShutdown
     */
    shutdownStreamMonitor() {

        if (this.streamlinkProcess) {
            console.log("Stopping processes & image parser")

            this.streamlinkProcess.kill('SIGINT')
            // this.ffmpegProcess.kill('SIGINT')   // Trying to use SIGINT for Linux
            // console.log("Killed streamlink processes")

            this.streamlinkProcess = null
            this.ffmpegProcess = null
            return true
        }

        return false
    }

    /**
     * Parse an image for names
     * @param {*} imageLike 
     * @returns 
     */
    async parseImgFile(imageLike) {
        if (this.serverStatus.state == SERVER_STATE_ENUM.COMPLETE) {
            console.debug(`In COMPLETE/STOP state, ignoring.`)
            return
        }

        this.serverStatus.imgs_downloaded += 1

        if (this.debugVODDump) {
            console.debug(`Stream is dumped to location ${VOD_DUMP_LOC}`)
            fs.mkdir(`${VOD_DUMP_LOC}`, {recursive: true})
            fs.writeFile(`${VOD_DUMP_LOC}${this.serverStatus.imgs_downloaded}.png`, imageLike)
            return
        }

        // TODO: Log when image enters this function and when it exits
        // Therefore keeping track of the delay from live
        let captureDt = Date.now()
        
        let mng = new MarbleNameGrabberNode(imageLike, false)

        if (this.serverStatus.state == SERVER_STATE_ENUM.WAITING) {
            const validMarblesImgBool = await mng.checkImageAtLocation(
                MarbleNameGrabberNode.START_BUTTON_TEMPLATE, 0.9)
            if (validMarblesImgBool) {
                console.log("Found Marbles Pre-Race header, starting read")
                this.serverStatus.state = SERVER_STATE_ENUM.READING
                this.serverStatus.started_stream_ts = new Date()
            } else {
                return
            }
        }
        
        // Parse the image for names
        console.debug(`Queuing LIVE image queue: ${this.getTextRecgonQueue()}`)

        const funcImgId = this.imageProcessId++

        // Build buffer
        await mng.buildBuffer()
        .catch( err => {
            console.warn("Buffer was not created successfully, skipping")
            throw err
        })
        
        // Perform tesseract 
        let tesseractPromise = null
        /** scaled color buffer from original */
        const OCRColorNameBuffer = mng.bufferToPNG(mng.buffer, true, false)

        if (!this.uselambda) {
            tesseractPromise = mng.isolateUserNames()
            .then( buffer =>  this.scheduleTextRecogn(buffer) )
        } else {
            tesseractPromise = mng.dumpInternalBuffer()
            .then ( ({buffer, imgMetadata, info}) => 
                this.sendImgToLambda(buffer, imgMetadata, info, `lid:${this.serverStatus.imgs_downloaded}`, false)
            )
            this.lambdaQueue += 1
        }
        
        return tesseractPromise.then( ({data, info}) => {      // add result to nameBuffer
            
            if (this.uselambda)
                this.lambdaQueue -= 1
            this.serverStatus.imgs_read += 1

            // Add to queue
            this.imageProcessQueue[funcImgId - this.imageProcessQueueLoc] = [data, mng]
            // console.debug(`Added ${funcImgId} to queue loc ${funcImgId - this.imageProcessQueueLoc}`)

            while (this.imageProcessQueue.at(0)) {  // While next image exists
                let [qdata, qmng] = this.imageProcessQueue.shift()
                if (this.serverStatus.state == SERVER_STATE_ENUM.COMPLETE) {
                    console.warn(`Dumping image ${funcImgId}`)
                    break
                }
                this.imageProcessQueueLoc++

                let retList = this.usernameList.addPage(qdata, OCRColorNameBuffer, mng.bufferSize, captureDt)
                if (retList.length == 0)
                    this.emptyListPages += 1
                else
                    this.emptyListPages = 0
                console.debug(`UserList is now: ${this.usernameList.length}, last added: ${retList.at(-1)}`)
                
                if (this.emptyListPages >= EMPTY_PAGE_COMPLETE && this.usernameList.length > 5) {
                    console.log(`${this.emptyListPages} empty frames @ ${funcImgId}; 
                        dumping queue ${this.imageProcessQueue} & moving to COMPLETE state.`)
                    this.serverStatus.state = SERVER_STATE_ENUM.COMPLETE
                    this.spinDown()
                    return
                }
            }
        }).catch ( err => {
            console.warn(`Error occurred during imageParse ${err};${err.stack}, execution exited`)
            // Since this is continous, this info/image is discarded
        })
    }


    /**
     * Sends image file to lambda function, which returns a payload containing the tesseract information
     * 
     * @param {Buffer} imgBuffer An buffer containing a png image
     * @returns {Promise} Promise containing lambda result with tesseract info. Or throws an error
     */
    async sendImgToLambda(bufferCrop, imgMetadata, info, jobId='test', lambdaTest=false) {

        const payload = {
            buffer: bufferCrop.toString('base64'),
            imgMetadata: imgMetadata,
            info: info,
            jobId: jobId,
            test: lambdaTest
        }

        const input = { // Invocation request
            FunctionName: "OCR-on-Marbles-Image",
            InvocationType: "RequestResponse",
            LogType: "Tail",
            // ClientContext: "Context",
            Payload: JSON.stringify(payload), // stringified value
            // Qualifier: "Qualifier"
        }

        
        const command = new InvokeCommand(input)
        console.debug(`Sending lambda request ${jobId}`)
        let result = await this.lambdaClient.send(command)

        if (result['StatusCode'] != 200)
            throw Error(result["LogResult"])
        else {
            let resPayload = JSON.parse(Buffer.from(result["Payload"]).toString())
            // let {data, info, jobId} = resPayload
            return resPayload
        }
    }

    /** Send Warmup request to lambda */
    async sendWarmupLambda(jobId='test') {

        const payload = {
            buffer: "",
            jobId: jobId,
            warmup: true
        }

        const input = { // Invocation request
            FunctionName: "OCR-on-Marbles-Image",
            InvocationType: "RequestResponse",
            LogType: "Tail",
            Payload: JSON.stringify(payload), // stringified value
        }

        
        const command = new InvokeCommand(input)
        console.debug(`Sending lambda warmup ${jobId}`)
        return this.lambdaClient.send(command)
        .then(resp => resp['StatusCode'])

    }
    
    /**
     * Get current image queue
     * @returns {Number}
     */
    getTextRecgonQueue () {
        if (this.uselambda)
            return this.lambdaQueue
        else if (this.OCRScheduler)
            return this.OCRScheduler.getQueueLen()
        else
            return 0
    }

    /**
     * Stop stream-monitor, reset base parameters
     */
    spinDown () {
        this.shutdownStreamMonitor()
        if (this.OCRScheduler)
            this.OCRScheduler.jobQueue = 0
        this.emptyListPages = 0
        this.serverStatus.ended_stream_ts = new Date()
    }

    /**
     * Runs whatever debug thing I want with a local filename I want 
     * @param {*} filename 
     * @param {*} withLambda 
     * @returns 
     */
    async debugRun (filename = null, withLambda = false) {
        filename ??= TEST_FILENAME
        console.log(`Running debug! ${filename}`)
        console.log(`Working directory: ${path.resolve()}`)
        
        let mng = new MarbleNameGrabberNode(filename, true)

        let m = await mng.checkImageAtLocation(
            MarbleNameGrabberNode.START_BUTTON_TEMPLATE
        ).catch( err => {
            console.log(err)
        })
        console.log(`WaitingForStart was ${m}`)

        if (withLambda) {
            console.log("Using lambda debug")
            await this.warmupLambda(1)
            await mng.buildBuffer().catch( err => {console.error(`Buffer build errored! ${err}`); throw err})
            mng.orig_buffer = mng.buffer

            return mng.dumpInternalBuffer()
            .then( ({buffer, imgMetadata, info}) => this.sendImgToLambda(buffer, imgMetadata, info, 'test', false))
            .then( ({data, info, jobId}) => {console.debug(`Lambda complete job-${jobId}`); return {mng: mng, data: data}})
            .catch( err => {console.error(`Lambda errored! ${err}`); throw err})
            // NOTE: This doesn't return early
        }
        // ELSE
        await this.setupWorkerPool(1)
        
        let debugStart = performance.now();

        return mng.buildBuffer()
        .catch( err => {
            console.warn("Buffer was not created successfully, skipping")
            throw err
        })
        .then(  () => {
            console.log(`Built buffer in ${performance.now() - debugStart}ms`)
            debugStart = performance.now();
            return mng.isolateUserNames()
        })
        .then(  buffer => {
            console.log(`Binarized in ${performance.now() - debugStart}ms`)
            debugStart = performance.now();
            return this.scheduleTextRecogn(buffer)})
        .then(  tsData => { 
            console.log(`Recognized in ${performance.now() - debugStart}ms`)
            return {mng: mng, data: tsData.data} 
        })
        .catch(
            err => {
                console.error(`Debug: An unknown error occurred ${err}.${err.stack}`)
                throw err
            }
        )
    }


    // Tesseract.js
    /**
     * Create new worker and add to scheduler
     * @param {*} worker_num worker id
     * @returns 
     */
    async addOCRWorker (worker_num) {
        console.debug(`Creating Tesseract worker ${worker_num}`)

        const options = {}
        if (this.debugTesseract) {
            options["logger"] = msg => console.debug(msg)
            options["errorHandler"]  = msg => console.error(msg)
        }

        let tesseractWorker = await createWorker(options)
        await tesseractWorker.loadLanguage('eng')
        await tesseractWorker.initialize('eng');
        await tesseractWorker.setParameters({
            tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQKRSTUVWXYZ_0123456789', // only search a-z, _, 0-9
            preserve_interword_spaces: '0', // discard spaces between words
            tessedit_pageseg_mode: '6',      // read as vertical block of uniform text
            // tessedit_pageseg_mode: '11',      // read individual characters (this is more likely to drop lines),
            // tessjs_create_hocr: "0",
            // tessjs_create_tsv: "0",
            // tessjs_create_box: "1",
            // tessjs_create_unlv: "0",
            // tessjs_create_osd: "0"
        })

        console.debug(`Tesseract Worker ${worker_num} is built & init`)
        this.OCRScheduler.addWorker(tesseractWorker)
        return tesseractWorker

    }

    /**
     * Schedule text recognition on the OCR scheduler
     * @param {*} imageLike 
     * @param {*} options 
     * @returns 
     */
    async scheduleTextRecogn (imageLike, options) {
        // Create OCR job on scheduler
        if (!this.OCRScheduler) 
            throw Error('OCRScheduler is not init')
        return this.OCRScheduler.addJob('recognize', imageLike, options)
    }

    // --------------------------------------------------------------------
    // Router/Server functions
    // --------------------------------------------------------------------

    /**
     * Retrieve and store twitch token for channel info
     */
    async getTwitchToken() {

        if (this.twitch_access_token) return this.twitch_access_token

        // Retrieve twitch JSON info
        if (!TWITCH_ACCESS_TOKEN_BODY) {
            try {
                const fileContent = await fs.readFile(TWITCH_CRED_FILE, {encoding:'utf8'})
                TWITCH_ACCESS_TOKEN_BODY = JSON.parse(fileContent)
            } catch (err) {
                console.warn("Twitch credential file not found. Exiting")
                return
            }
        }

        const auth_body = TWITCH_ACCESS_TOKEN_BODY

        return axios.post(TWITCH_TOKEN_URL, auth_body,
            { headers:{'Content-Type': 'application/x-www-form-urlencoded'} }
        )
        .then( res => {
            // save token
            this.twitch_access_token = res.data['access_token']
            
            // Set auth headers
            this.twitch_auth_headers = {
                "Authorization": `Bearer ${this.twitch_access_token}`,
                "Client-Id": `${TWITCH_ACCESS_TOKEN_BODY.client_id}`
            }
            // set timeout to clear this token
            // const timeoutMs = parseInt(res.data['expires_in']) * 1_000
            // const timeoutMs = 15* 24 * 60 * 60 * 1_000 // Capped to 24 days due to int overflow.
            // FIXME: Setup a new callback that triggers comparing Date.now instead
            // setTimeout(()=> {this.twitch_access_token = null}, timeoutMs)
            
            console.log("Retrieved Twitch Access Token")
            return this.twitch_access_token
        })
        .catch( err => {
            console.error(`Something went wrong...? Can't setup Twitch token. ${err}`)
        })
    }

    /**
     * Setup the twitch game monitor & start when game switches to Marbles On Stream
     */
    async setupTwitchMonitor () {
        const MARBLES_ON_STREAM_GAME_ID = 509511

        if (!this.game_type_monitor_interval) {
            await this.getTwitchToken()

            let firstReq = true
            this.game_type_monitor_interval = setInterval( () => {
                axios.get(`${TWITCH_CHANNEL_INFO_URL}?broadcaster_id=${this.broadcaster_id}`, 
                // axios.post(`https://api.twitch.tv/helix/users`,
                    { headers: this.twitch_auth_headers }
                )
                .then( resp => {
                    if (firstReq) {
                        console.log("Set up Twitch Game Monitor")
                        firstReq = false
                    }

                    // check game name
                    const new_game_name = resp.data.data[0]['game_name']
                    const new_game_id = parseInt(resp.data.data[0]['game_id'])
                    if ((new_game_id == MARBLES_ON_STREAM_GAME_ID || new_game_name.toLowerCase() == 'marbles on stream') &&
                        this.last_game_name != new_game_name) {
                            // Start up the streamMonitor
                            console.log(`Switched Game to ${new_game_name}; clearing & starting streamMonitor`)
                            this.clear() // Redundant, start already causes a clear
                            this.start(TWITCH_DEFAULT_BROADCASTER)
                        }

                    this.last_game_name = new_game_name
                }).catch( err => {
                    console.warn(`Failed to get Twitch-Monitor ${err}`)
                    if (err.response) {
                        if (err.response.status == 401) {
                            this.twitch_access_token = null
                            console.log("Refreshing Twitch Access Token")
                            this.getTwitchToken()
                        }
                    }
                    // clearInterval(this.game_type_monitor_interval) // Don't clear monitor
                })
            }, 1_000 * 3) // Check every 3 seconds
        }
    }

    /**
     * Setup worker pool
     * @param {String} channel
     */
    start (channel, vodDumpFlag=false) {
        let retText = 'Already started'

        if (vodDumpFlag) {
            console.log(`Setting vodDump to ${vodDumpFlag}`)
            this.debugVODDump = vodDumpFlag
        }

        if (this.streamlinkProcess == null) {
            this.usernameList.clear()
            
            if (!this.uselambda)
                this.setupWorkerPool(NUM_LIVE_WORKERS)
            else 
                this.warmupLambda(NUM_LAMBDA_WORKERS)
                // this.lambdaClient = new LambdaClient(AWS_LAMBDA_CONFIG)
            
            this.startStreamMonitor(channel)

            // this.serverStatus.started_stream_ts = new Date()
            // this.serverStatus.state = SERVER_STATE_ENUM.WAITING
            retText = "Waiting for names"
        }
        return {"state": this.serverStatus.state, "text": retText}
    }

    stop () {
        let resp_text = "Already Stopped"

        if (this.serverStatus.state != SERVER_STATE_ENUM.STOPPED) {
            this.spinDown()
        // const stopped = this.shutdownStreamMonitor()

        // if (stopped) {
            resp_text = "Stopped image parser"
            this.serverStatus.state = SERVER_STATE_ENUM.STOPPED
        }

        this.debugVODDump = false;

        return {"state": this.serverStatus.state, "text": resp_text}
    }

    setMarblesDate (date) {
        this.serverStatus.marbles_date = new Date(date)
        return "Marbles Date set!"
    }

    clear () {
        this.serverStatus.imgs_downloaded = 0
        this.serverStatus.imgs_read = 0
        this.usernameList.clear()
        return "Cleared usernameList."
    }

    status (req) {

        // Track viewers
        const curr_dt = Date.now()
        while (this.monitoredViewers && this.monitoredViewers[0] < curr_dt)
            this.monitoredViewers.shift()
        this.monitoredViewers.push(Date.now() + this.serverStatus.interval) // TODO: Link client to this value

        this.serverStatus.viewers = this.monitoredViewers.length

        let streaming_time = 'X'
        if (this.serverStatus.started_stream_ts) {
            if (this.serverStatus.ended_stream_ts)
                streaming_time = humanReadableTimeDiff(this.serverStatus.ended_stream_ts - this.serverStatus.started_stream_ts)
            else
                streaming_time = humanReadableTimeDiff(Date.now() - this.serverStatus.started_stream_ts)
        }
        
        

        return {
            'status': this.serverStatus,
            'job_queue': this.getTextRecgonQueue(),
            'streaming': streaming_time,
            'userList': this.usernameList.status(),
        }
    }

    find (reqUsername) {
        return this.usernameList.find(reqUsername)
    }

    userFind (reqUsername) {
        const userObj = this.usernameList.hash.get(reqUsername)
        if (userObj) {
            // return actual object
            // TODO: Return 0 if userVerified
            return {'userObj': userObj, 'match': 1 }
        } else {
            // return best matches [levenDist, userObj]
            // TODO: Weigh based on input name length (long names are lenient, short vice versa)
            let users = this.usernameList.find(reqUsername, 7, false)
            
            let levDist = users.at(0) ? users.at(0)[0] : Infinity
            let matchDist = 4
            // now score based on distance
            if (levDist < 2) 
                matchDist = 1
            else if (levDist < 5)
                matchDist = 2
            else if (levDist < 8)
                matchDist = 3
            
            return {'userObj': users.at(0)?.[1], 'match': matchDist, 'levenDist': levDist}
        }
    }

    getImage (reqUsername) {
        return this.usernameList.getImage(reqUsername)
    }

    getFullImg(reqId) {
        return this.usernameList.getImageFromFullList(reqId)
    }

    list () {
        return Object.fromEntries(this.usernameList.hash)
    }

    debug (filename, withLambda, waitTest=false, raceTest=false) {
        // TODO: Add waitTest & raceTest separately as params

        return this.debugRun(filename, withLambda)
        .then( async ({mng, data}) => {
            // TODO: Fix resync
            let retList = await this.usernameList.addPage(data, mng.bufferToPNG(mng.orig_buffer, true, false), mng.bufferSize, Date.now())
            return {list: retList, debug:true}
        })
        
        // ELSE RAISE ERROR
    }

    async runTest (folderName, withLambda) {
        // let namesFile = null
        // get all image files in order for vod_folder
        const fileList = await fs.readdir(folderName);
        // gotta windows* sort
        fileList.sort( (fileA, fileB) => {
            return parseInt(fileA.split('.')[0], 10) - parseInt(fileB.split('.')[0], 10)})
        // NaN files are ignored

        let nameFileContents = null
        if (fileList == null) 
            throw new Error("Invalid folder, contents are empty/DNE")

        console.log(`Running test! ${folderName}`)
        const st = performance.now();
        await this.setupWorkerPool(NUM_LIVE_WORKERS*2)

        const promiseList = []
        let ignoreFrames = 60;

        for (const fileName of fileList) {
            if (fileName.endsWith('txt')) {
                nameFileContents = fs.readFile(path.resolve(folderName, fileName),  { encoding: 'utf8' })
                continue
            }
            if (ignoreFrames-- > 0) continue;
            // if (ignoreFrames < -50) continue;
            // send each image file to parse
            const file = await fs.readFile(path.resolve(folderName, fileName))
            promiseList.push(this.parseImgFile(file)) // filename works but I want to read
            console.debug(`Parsing image file ${fileName}`)
            await setTimeout(50); // forcing sleep so my computer doesn't explode
            // break;
        }

        // TODO: Need to check for bad joins

        // Once complete, go through the names list and check against server accuracy
        Promise.all(promiseList)
        .then(async () => {
            const ed = performance.now();
            if (!nameFileContents) return;
            const nameList = await nameFileContents.then(content => content.split('\r\n'))
            console.debug(`Namelist: ${nameList.length}`)

            let totalScore = 0;
            const scoreArr = [];
            const notFound = [];
            let nameListIdx = 0;
            for (const name of nameList) {
                let list = this.find(name);
                let bestDistScore = list[0][0]
                scoreArr.push(bestDistScore);
                totalScore += bestDistScore;
                if (bestDistScore > 7) {
                    notFound.push(`[${nameListIdx}]${name}`)
                }
                nameListIdx++;
            }

            scoreArr.sort();
            const median = scoreArr[parseInt(scoreArr.length/2)];
            
            const map = new Map()
            let nonPerfectAvg = 0;
            let nonPerfectCount = 0;
            for (const score of scoreArr) {
                map.set(score, map.get(score)+1 ?? 0);
                if (score > 1) {
                    nonPerfectCount++;
                    nonPerfectAvg += score
                }
            }

            console.debug(`All scores: ${Array.from(map.entries()).map(([key, val]) => `${[key]}=${val}`).join('\n')} `)
            console.debug(`Final score: ${totalScore}, mean: ${totalScore/nameList.length}`)
            console.debug(`median: ${median}, avg-non-perfect ${nonPerfectAvg/nonPerfectCount}`)
            console.debug(`Not found list [${notFound.length}]: \n${notFound.join(', ')}`)
            console.debug(`Completed test in ${((ed-st)/(60*1000)).toFixed(3)}m`)
        })
        

        return {test:"testing ongoing!"}
    }
}


// Debug code in here


// Working encode + decoder
// RUN THIS IN COMMAND PROMPT
// ffmpeg -i "C:\Users\MiloticMaster\Videos\MGS joke\barbCut_480.mp4" -f matroska pipe:1 | ffmpeg -f matroska -i pipe:0 output.mp4
// streamlink twitch.tv/barbarousking best --stdout | ffmpeg -f mpegts -i pipe:0 -vf fps=1 -y -update 1 testing/live.png

// VOD testing

// streamlink "https://www.twitch.tv/videos/1891700539?t=2h30m22s" best 
/* streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best
  streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best --stdout | ffmpeg -re -f mpegts -i pipe:0 -f image2 -pix_fmt rgba -vf fps=fps=1/2 -y -update 1 live.png
  
  streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best --stdout | ffmpeg -re -f mpegts -i pipe:0 -copyts -f image2 -pix_fmt rgba -vf fps=fps=1/2 -frame_pts true %d.png
  
  streamlink "https://twitch.tv/barbarousking" "best" --stdout | ffmpeg -re -f mpegts -i pipe:0 -vf fps=2 test.ts

  ffmpeg -re '-f','mpegts', '-i','pipe:0', '-f','image2', '-pix_fmt','rgba', '-vf','fps=fps=1/2', 'pipe:1'

  Explaining ffmpeg mysteries
    streamlink       = (program for natively downloading streams)
    <twitch-vod url> = se
    best             = streamlink quality option
    --stdout         = output stream to the stdout pipe

    ffmpeg
    -re = read at the native readrate (so realtime)
    -f mpegts = the input encoded pipe media format (for Twitch)
    -i pipe:0 = input is stdin (from previous pipe)
    -f image2 = use the image2 encoder (for files)
    -pix_fmt rgba = output png is rgba (32 bit depth)
    -vf         = video filters or something
        fps=fps=1/2 = create a screenshot 1/2 per second (2 times a second)
    -y          = do not confirm overwriting the output file
    -update     = continue to overwrite the output file/screenshot
    <screenshot.png> = output filename

    streamlink "https://twitch.tv/barbarousking" "best" --stdout | ffmpeg -re -f mpegts -i pipe:0 -f image2pipe -pix_fmt rgba -c:v png -vf fps=fps=1/2 pipe:1

    Explaining more commands
    -f image2pipe = if you pipe image2, its gets mad and crashes
    -c:v png    = video output is png
    pipe:1      = output to stdout
*/
