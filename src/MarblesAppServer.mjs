// Node Server that manages, saves and processes images for MarblesNameGrabber

import path from 'node:path'
import { ChildProcess, spawn } from 'node:child_process'
import axios from 'axios'
import fs from 'fs/promises'

import { UserNameBinarization } from './UsernameBinarization.mjs'
import {UsernameAllTracker, UsernameTracker, TrackedUsername} from './UsernameTrackerClass.mjs'

import { createWorker, createScheduler } from 'tesseract.js'
import { humanReadableTimeDiff, msToHUnits } from './DataStructureModule.mjs'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
// import { setInterval } from 'node:timers'
import { setTimeout } from 'node:timers/promises'
import { XMLParser } from 'fast-xml-parser'
import { SharpImg } from './UtilModule.mjs'
import { StreamingImageBuffer, ServerStatus, StreamImageTracking, ScreenState } from './ServerClassModule.mjs'
import { NativeTesseractOCRManager, OCRManager } from './OCRModule.mjs'

/** Server state enum */
export const SERVER_STATE_ENUM = {
    /** Server has stopped/has not started reading */
    STOPPED: 'STOPPED',
    /** Server is waiting for the load screen */
    WAITING: 'WAITING', 
    /** Server is READING and doing OCR */
    READING: 'READING',
    /** Server completed reading. */
    COMPLETE: 'COMPLETE'
}

const TWITCH_URL = 'https://www.twitch.tv/'
const DEBUG_URL = 'https://www.twitch.tv/videos/1891700539?t=2h30m20s'
const LIVE_URL = 'https://www.twitch.tv/barbarousking'

const NUM_LIVE_WORKERS = 12 // Num Tesseract workers
const WORKER_RECOGNIZE_PARAMS = {
    blocks:true, hocr:false, text:false, tsv:false
}
const TEST_FILENAME = "testing/test.png"
const LIVE_FILENAME = "testing/#.png"
const VOD_DUMP_LOC = "testing/vod_dump/"

let TWITCH_ACCESS_TOKEN_BODY = null
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
const TWITCH_CHANNEL_INFO_URL = "https://api.twitch.tv/helix/channels"
const TWITCH_DEFAULT_BROADCASTER = "barbarousking" // Default twitch channel
const TWITCH_DEFAULT_BROADCASTER_ID = "56865374" // This is the broadcaster_id for barbarousking
const TWITCH_CRED_FILE = 'twitch_creds.json'

const AWS_LAMBDA_CONFIG = { region: 'us-east-1'}
const USE_LAMBDA = true
const NUM_LAMBDA_WORKERS = 12 // Num Lambda workers

const TESSERACT_ARGS = [
    // <image_filename>, '-', // stdin, stdout
    "-", "-",
    "--psm", "4",
    "-l", "eng",
    "-c", "preserve_interword_spaces=1",
    "-c", "tessedit_char_whitelist=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQKRSTUVWXYZ_0123456789",
    "-c", "hocr_char_boxes=1",
    "hocr"
];


export class MarblesAppServer {

    /** Determines some programs/settings */
    static ENV = 'dev' // set from router

    // TODO: Change tesseract cmd in object
    static TESSERACT_LOC = String.raw`C:\Program Files\Tesseract-OCR\tesseract.exe`
    
    // Needs to handle both linux for prod and windows for dev
    static FFMPEG_LOC = String.raw`C:\Program Files\Streamlink\ffmpeg\ffmpeg.exe` // NOTE: should work on all streamlink installations
    static STREAMLINK_LOC = 'streamlink' // on PATH

    /** FPS to view stream */
    static FFMPEG_FPS = '20'
    /** number of frames/seconds without any valid names on them */
    static EMPTY_PAGE_COMPLETE = 5 * parseInt(MarblesAppServer.FFMPEG_FPS)
    
    static DEFAULT_STEAM_URL = LIVE_URL

    constructor () {
        // Server state objects

        /** Format to output images to ffmpeg */
        this.streamImgFormat = StreamingImageBuffer.JPG_FORMAT

        /** @type {ScreenState} Keep track of state of screen during parsing */
        this.ScreenState = new ScreenState()
        /** @type {StreamImage} used to parse streaming buffer into images */
        this.StreamImage = new StreamImageTracking(this.streamImgFormat)
        /** @type {ServerStatus} Track overall server status for outside observation */
        this.ServerState = new ServerStatus()
        
        // Debug variables ===========================================
        this.debug_obj = {
            native_tesseract: false,
            tesseract: true,
            process: false,
            lambda: false,
            vod_dump: false,
            screen_state_log: false,
            fps: false,
        }

        // debug variables
        this.debugTesseract = false;
        this.debugLambda = false;

        // Processors & Commands
        // ================================
        /** Streamlink command-line */
        this.streamlinkCmd = [MarblesAppServer.STREAMLINK_LOC, MarblesAppServer.DEFAULT_STEAM_URL, 'best', '--stdout']
        
        /** ffmpeg command-line */
        this.ffmpegCmd = [MarblesAppServer.FFMPEG_LOC, '-re', '-i','pipe:0', '-f','image2pipe', 
                            '-c:v', ...this.streamImgFormat[1],
                            '-vf', `fps=${MarblesAppServer.FFMPEG_FPS}`, 'pipe:1']
        /** Tesseract command-line location */
        this.tesseractCmd = MarblesAppServer.TESSERACT_LOC

        // Processors
        // ========================================================
        /** @type {ChildProcess} Node process for streamlink */
        this.streamlinkProcess = null
        /** @type {ChildProcess} Node process for ffmpeg */
        this.ffmpegProcess = null
        
        // Twitch tokens & vars
        // ==============================================
        /** enable twitch monitoring */
        this.enableTwitchMonitor = false;
        this.twitch_access_token = null
        this.game_type_monitor_interval = null
        this.broadcaster_id = TWITCH_DEFAULT_BROADCASTER_ID
        this.last_game_name = null

        // Start up the Twitch game monitor
        if (this.enableTwitchMonitor)
            this.setupTwitchMonitor()

        // Tesseract variables
        // ======================================================
        /** @type {OCRManager} OCR to manage */
        this.OCRManager = new NativeTesseractOCRManager(3, 
            this.debug_obj.native_tesseract, true)

        /** OCR Worker object */
        this.OCRScheduler = null
        this.numOCRWorkers = 0

        // Lambda state
        if (this.debugLambda)  AWS_LAMBDA_CONFIG["logger"] = console
        // this.lambdaClient = new LambdaClient(AWS_LAMBDA_CONFIG)
        this.uselambda = USE_LAMBDA
        /** @type {LambdaClient} AWS lambda */
        this.lambdaClient = null
        this.lambdaQueue = 0    // Keep track of images sent to lambda for processing

        // Username Tracking
        // ==================================================
        // /** @type {UsernameTracker} Userlist for server */
        // this.usernameList = new UsernameTracker() 
        /** @type {UsernameAllTracker} Userlist but better */
        this.usernameTracker = new UsernameAllTracker()

        // Server Variables
        // ================================================
        this.serverStatus_obj = {
            // state: SERVER_STATE_ENUM.STOPPED,   // current state
            // viewers: 0,                         // current viewers on the site
            // interval: 1_000 * 3,                 // interval to refresh status
            // lag_time: 0                         // time behind from 
        }

    }

    // LAMBDA Functions
    // -------------------------------------------------------

    /** Warmup lambda by sending an empty file */
    async warmupLambda (workers) {
        if (!this.lambdaClient) {
            this.lambdaClient = new LambdaClient(AWS_LAMBDA_CONFIG)

            let lambda_id=0
            while (lambda_id < workers) {
                this.sendWarmupLambda(`warmup ${lambda_id++}`)
            }
        }
    }

    // -------------------------
    // Server processing functions
    // -------------------------
    /**
     * Start downloading channel or vod to read
     * starts streamlink -> ffmpeg processing
     * Note this also setups variables assuming a state changing going to START
     * @param {String} twitch_channel 
     * @returns 
     */
    startStreamMonitor(twitch_channel=null) {
        // Start process for stream url

        if (this.streamlinkProcess) return // TODO: Return error

        this.ServerState.enterWaitState()

        if (twitch_channel)
            this.streamlinkCmd[1] = TWITCH_URL + twitch_channel
        else
            this.streamlinkCmd[1] = MarblesAppServer.DEFAULT_STEAM_URL

        console.debug(`Starting monitor in directory: ${process.cwd()}\n`+
                        `Watching stream url: ${this.streamlinkCmd[1]}`)
        if (this.debug_obj.vod_dump) {
            console.debug(`Stream is dumped to location ${VOD_DUMP_LOC}`)
            fs.mkdir(`${VOD_DUMP_LOC}`, {recursive: true})
        }

        this.streamlinkProcess = spawn(this.streamlinkCmd[0], this.streamlinkCmd.slice(1), {
            stdio: ['inherit', 'pipe', 'pipe']
        })
        this.ffmpegProcess = spawn(this.ffmpegCmd[0], this.ffmpegCmd.slice(1), {
            stdio: ['pipe', 'pipe', 'pipe']
        })

        this.streamlinkProcess.stdout.pipe(this.ffmpegProcess.stdin) // pipe to ffmpeg

        
        // On Streamlink start, make log to request
        let outputStreamlinkBuffer = false
        this.streamlinkProcess.stderr.on('data', (data) => {
            const stringOut = data.toString()
            if (this.debug_obj.process)
                console.log(stringOut)
            // FIXME: Output error when stream is unavailable
            if (!outputStreamlinkBuffer & stringOut.includes('Opening stream')) {
                outputStreamlinkBuffer = true
                console.debug('Streamlink is downloading stream-')
            }
        })

        // On FFMpeg start, make log
        let outputFFMPEGBuffer = false
        this.ffmpegProcess.stderr.on('data', (data) => {
            const stringOut = data.toString()
            if (this.debug_obj.process)
                console.log(stringOut)
            if (!outputFFMPEGBuffer & stringOut.includes('frame=')) {
                outputFFMPEGBuffer = true
                console.debug('FFMpeg is outputting images to buffer-')
            }
        })

        this.ffmpegProcess.stdout.on('data', (/** @type {Buffer}*/ streamImgBuffer) => {
            // NOTE: Data is a buffer with partial image data
            const newFrameBuffer = this.StreamImage.addToBuffer(streamImgBuffer)
            if (newFrameBuffer !== null) {
                this.handleImage(newFrameBuffer)
                if (this.debug_obj.fps)
                    console.log(`Current FPS ${this.StreamImage.fps.toFixed(1)}`)
            }
        })

        // Error-handling
        this.streamlinkProcess.on('error', (err) => {
            console.warn("An unknown error occurred while writing Streamlink process." + err)
        })
        this.ffmpegProcess.on('error', () => {
            console.warn("An unknown error occurred while writing FFMpeg process.")
        })

        // Closed handling
        this.streamlinkProcess.on('close', () => {
            console.debug('Streamlink process has closed.')
            this.spinDown()
            this.ServerState.enterStopState()
        })
        this.ffmpegProcess.on('close', () => {
            console.debug('FFMpeg process has closed.')
            // NOTE: Ignoring the spinDown server state as both shutdown each other
            this.ServerState.enterStopState()
        })

        console.debug("Set up streamlink->ffmpeg processes")
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
     * @deprecated
     * Parse an image for names
     * @param {*} imageLike 
     * @returns 
     */
     async parseImgFile(imageLike) {
        if (this.serverStatus.state == SERVER_STATE_ENUM.COMPLETE) {
            console.debug(`In COMPLETE/STOP state, ignoring.`)
            return
        }

        const imgId = this.serverStatus.imgs_downloaded++

        if (this.debugVODDump) {
            console.debug(`Stream is dumped to location ${VOD_DUMP_LOC}`)
            fs.mkdir(`${VOD_DUMP_LOC}`, {recursive: true})
            fs.writeFile(`${VOD_DUMP_LOC}${imgId}.png`, imageLike)
            return
        }

        // TODO: Log when image enters this function and when it exits
        // Therefore keeping track of the delay from live
        /** ts of when image first entered the queue */
        const captureDt = Date.now()
        const perfCapture = performance.now()
        
        let mng = new UserNameBinarization(imageLike, false)

        if (this.serverStatus.state == SERVER_STATE_ENUM.WAITING) {
            // let validMarblesImgBool = await this.validateMarblesPreRaceScreen(mng)
            let validMarblesImgBool = await mng.validateMarblesPreRaceScreen()

            if (validMarblesImgBool) {
                console.log("Found Marbles Pre-Race header, starting read")
                this.serverStatus.state = SERVER_STATE_ENUM.READING
                this.serverStatus.started_stream_ts = new Date()
            } else {
                return
            }
        }

        
        // TODO: Try and detect BARB & CHAT location & update
        
        // TODO: Read the username number in the top right
        // Depending on how slow, it will be hard to be real-time

        // TODO: Build buffer then try detect username

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
        mng.ocr_buffer = mng.bufferToPNG(mng.buffer, true, false)

        if (!this.uselambda) {
            tesseractPromise = mng.isolateUserNames()
            // .then( buffer =>  this.scheduleTextRecogn(buffer) )
            .then( buffer =>  this.nativeTesseractProcess(buffer) )
            .catch( err => {
                console.error("Failure to parse image!!!")
            })
        } else {
            tesseractPromise = mng.dumpInternalBuffer()
            .then ( ({buffer, imgMetadata, info}) => 
                this.sendImgToLambda(buffer, imgMetadata, info, `lid:${imgId}`, false)
            )
            this.lambdaQueue += 1
        }
        
        return tesseractPromise.then( ({data, info, jobId}) => {      // add result to nameBuffer
            
            if (this.uselambda)
                this.lambdaQueue -= 1
            this.serverStatus.imgs_read += 1

            // Add to queue
            this.imageProcessQueue[funcImgId - this.imageProcessQueueLoc] = [data, mng]

            while (this.imageProcessQueue.at(0)) {  // While next image exists
                let [qdata, qmng] = this.imageProcessQueue.shift()
                if (this.serverStatus.state == SERVER_STATE_ENUM.COMPLETE) {
                    console.warn(`Dumping image ${funcImgId}`)
                    break
                }
                this.imageProcessQueueLoc++

                let retList = this.usernameTracker.addPage(qdata, qmng.ocr_buffer, qmng.bufferSize, captureDt)
                if (retList.length == 0)
                    this.emptyListPages += 1
                else
                    this.emptyListPages = 0

                const processTS = performance.now() - perfCapture;
                console.debug(`UserList is now: ${this.usernameTracker.length}, last added: ${retList.at(-1)}. Lag-time: ${msToHUnits(processTS, false)}`)
                this.imageProcessTime.push(processTS);
                while (this.imageProcessTime.length > 10)
                    this.imageProcessTime.shift();
                this.serverStatus.lag_time = msToHUnits(
                    this.imageProcessTime.reduce((p,c) => p+c, 0)/this.imageProcessTime.length, true, 2, 's');
                
                if (this.emptyListPages >= MarblesAppServer.EMPTY_PAGE_COMPLETE && this.usernameTracker.length > 5) {
                    console.log(`${this.emptyListPages} empty frames @ ${funcImgId}; 
                        dumping queue ${this.imageProcessQueue.length} & moving to COMPLETE state.`)
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
     * Handle image before per-frame calculations
     * Stops processing if not available
     * @param {import('./UtilModule.mjs').ImageLike} imageLike 
     */
    async handleImage(imageLike) {
        if (this.ServerState.notRunning) {
            console.debug(`In COMPLETE/STOP state, dropping image.`)
            return
        }

        const imgId = this.StreamImage.imgs_downloaded

        if (this.debug_obj.vod_dump) {
            fs.writeFile(`${VOD_DUMP_LOC}${imgId}.${this.streamImgFormat.file_format}`, imageLike)
        }

        const EMPTY_IMAGE_NUM = parseInt(MarblesAppServer.FFMPEG_FPS) * 3
        if (this.ScreenState.frames_without_names > EMPTY_IMAGE_NUM) {
            console.log(`Found ${EMPTY_IMAGE_NUM} empty frames @ ${imgId};
                Dumping remaining images and changing to COMPLETE state.`)
            this.ServerState.enterCompleteState()
            this.spinDown()
            return
        }

        this.parseAdvImg(imageLike)
    }

    /** Parse advanced image per frame
     * Need a complex state machine to handle this
     * @param {import('./UtilModule.mjs').ImageLike} imageLike 
     */
    async parseAdvImg(imageLike) {
        
        const frameStartMark = 'frame-start'
        performance.mark(frameStartMark);
        
        const mng = new UserNameBinarization(imageLike, false)

        // TODO: Rework this and also check for obstructions
        if (this.ServerState.wait) {
            const validMarblesImgBool = await mng.validateMarblesPreRaceScreen()

            if (validMarblesImgBool) {
                console.log("Found Marbles Pre-Race header, starting read")
                this.ServerState.enterReadState()
            } else {
                return
            }
        }

        // Determine the visible & predicted users on this frame
        // ==============================================================================
        const processImgId = this.StreamImage.img_processed++
        
        /** All on-screen users with their appearance checked */
        const screenUsersArr = await mng.getUNBoundingBox([], {appear:true, length:false})
        /** All visible users this frame */
        const screenVisibleUsers = screenUsersArr.map((user, idx) => ({vidx:idx, vUser:user}))
            .filter(val => (val.vUser.appear == true))
        
        // Update if no visible users are available
        if (screenVisibleUsers.length == 0) {
            this.ScreenState.frames_without_names += 1
            return
        } else
            this.ScreenState.frames_without_names = 0

        // Get prediction from usernameList
        const setEnterFrame = this.ScreenState.knownScreen
        let {predictedUsers, offset} = this.usernameTracker.predict(processImgId, 
            {totalUsers:null, predictFullScreen:true}, setEnterFrame)
        
        /** Num of users to use for length check against prediction */
        const LEN_CHECK_MATCH = 6;
        /** Actual offset from on-screen analysis */
        let offsetMatch = null;
        
        // Reconcile offset by checking the prediction
        // ========================================================================
        // NOTE: always true, do not rely on prediction
        if (true) { //(offset === null || offset >= 0) { 
            // NOTE: If offset is a number [known], can use quickLen to check?
            // TODO: Assuming list contains all checked frames here
            
            /** list of users with length checked this frame */
            const currLenList = []
            const fstLenIdx = predictedUsers.findIndex(user => user.length !== null)
            
            for (const vobj of screenVisibleUsers) {
                const {vidx, vUser} = vobj
                // length checks should center around first visible idx
                if (vidx < (fstLenIdx - LEN_CHECK_MATCH/2)) continue 
                
                // calculate length from current screen
                const vlenArr = await mng.getUNBoundingBox([vidx], {appear:false, length:true})
                vUser.length = vlenArr[vidx].length
                vUser.matchLen = true
                currLenList.push(vobj)
                // NOTE: the available checks are reduced if length can't be determined
                if (currLenList.length >= LEN_CHECK_MATCH) break;
            }

            // calculate best matching ofset
            ({offset:offsetMatch} = UsernameAllTracker.findBestShiftMatch(
                predictedUsers, currLenList
            ))

            if (offsetMatch != null && offsetMatch > 0) {
                this.usernameTracker.shiftOffset(offsetMatch); // update offset
                // FYI this is a load-bearing semi-colon due to destructure object {o1, o2} below

                // Predicted users is inaccurate, recalc
                ({predictedUsers, offset} = this.usernameTracker.predict(processImgId, 
                    {totalUsers:null, predictFullScreen:true}, setEnterFrame))
            } else if (offsetMatch < 0) {
                console.error("Offset is negative! This is a DO NOTHING", offsetMatch)
            }
        }

        // After this line, the predictedUsers is verified
        // =======================================================================
        this.ScreenState.offsetMatchFrame.push(offset)

        // verify predictedUsers if not seen before
        for (const [idx, pUser] of predictedUsers.entries()) {
            if (!pUser.seen && screenUsersArr[idx].appear) { // if screen is known, set seen & time
                pUser.seen = screenUsersArr[idx].appear
                if (this.ScreenState.knownScreen) {
                    pUser.enterFrameTime = performance.now()
                }
            // once user can't be seen, set exitingFrameTime
            // TODO: Need to check against overlap logic imo
            } else if (pUser.seen && pUser.exitingFrameTime == null) {
                pUser.exitingFrameTime = performance.now()
            }
        }

        this.ScreenState.addPredictedFrame(predictedUsers)

        // Now do as many length checks for visible names that do not have length checks first
        const LEN_LIMIT_PER_FRAME = 25; // NOTE: Maxing this for testing
        let post_match_len_checks = 0
        for (const {vidx, vUser} of screenVisibleUsers) {
            const pUser = predictedUsers[vidx]
            if (pUser.length) continue;

            if (vUser.length === undefined) { // TODO: Do multiple checks at once
                const resultObj = await mng.getUNBoundingBox([vidx], {appear:false, length:true})
                vUser.length = resultObj[vidx].length
                vUser.unknownLen = true
                // if (!vUser.length) continue; // length not found
                post_match_len_checks++
            }
            if (vUser.length)
                pUser.length = vUser.length

            if (post_match_len_checks > LEN_LIMIT_PER_FRAME) break;
        }

        // Need to run OCR separately as length check out-priorities OCR 
        for (const {vidx, vUser} of screenVisibleUsers) {
            if (vidx == 23) continue; // cropping fails on last index
            if (vUser.length === null) continue; // Already failed to calc length this frame

            const pUser = predictedUsers[vidx]
            if (pUser.readyForOCR()) {
                if (vUser.length === undefined) { // must have a valid length this frame
                    const resultObj = await mng.getUNBoundingBox([vidx], {appear:false, length:true})
                    vUser.length = resultObj[vidx].length
                    vUser.ocrLen = true
                }
                if (vUser.length) {
                    pUser.length = vUser.length
                    this.queueIndividualOCR(pUser, vidx, mng, processImgId)
                }
            }
        }

        this.ScreenState.addVisibleFrame(screenUsersArr)
        
        if (this.debug_obj.screen_state_log && 
            (this.ScreenState.shouldDisplaySmth || post_match_len_checks > 0)) {
            console.log(
                `Frame_num ${processImgId.toString().padStart(5, ' ')} | Offset: ${offsetMatch} | User: ${this.usernameTracker.count}\n`+
                `V: ${this.ScreenState.visibleScreenFrame.at(-1)}`+'\n'+
                `P: ${this.ScreenState.predictedFrame.at(-1)}`
            )
        }

        if (!this.ScreenState.knownScreen)
            this.ScreenState.knownScreen = true // flip this when screen cannot be seen & top user is unknown

    }

    /**
     * Queue individual OCR 
     * @param {TrackedUsername} user 
     * @param {number} visibleIdx current index on this frame
     * @param {UserNameBinarization} mng binarization object
     */
    async queueIndividualOCR (user, visibleIdx, mng, processImgId) {
        // crop image
        user.ocr_processing = true;
        const binPerf = performance.now()
        const sharpBuffer = await mng.cropTrackedUserName(visibleIdx, user.length)
        // console.log(`Queuing OCR user vidx: ${visibleIdx} index ${user.index}`)

        const binUserImg = await mng.binTrackedUserName([sharpBuffer])
        console.log(`bin took ${performance.now() - binPerf}`)

        const binSharp = SharpImg.FromRawBuffer(binUserImg).toSharp({toJPG:true, scaleForOCR:true})
        const binBuffer = await binSharp.toBuffer()

        // await this.nativeTesseractProcess(pngBuffer)
        await this.OCRManager.queueOCR(binBuffer)
        .then( ({data, info, jobId, time}) => {

            this.ServerState.addUserReconLagTime(time)
            if (data.lines.length == 0) {
                console.warn(`Got nothing for #${processImgId} @ ${user.index}`)
                return
            }
            for (const line of data.lines) {
                if (line.text.length < 4) continue; // Twitch limits
                const text = line.text.trim()
                const confidence = line.confidence
                user.addImage(sharpBuffer.toSharp({toJPG:true}),
                    text,
                    confidence);
            }
            
            console.log(`Recongized name #${processImgId} @ ${user.index} as ${user.name} conf:${user.confidence.toFixed(1)}% in ${time.toFixed(0)}ms`)
        })
        .finally(
            _ => {
                user.ocr_processing = false; // finished processing OCR
            }
        )
        
    }


    // -----------------------
    // LAMBDA FUNCTIONS
    // -----------------------

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
     * Stop stream-monitor, stop OCR but do not clear state
     * reset base parameters
     */
    spinDown () {
        this.shutdownStreamMonitor()
        if (this.OCRScheduler)
            this.OCRScheduler.jobQueue = 0
    }

    /**
     * Runs whatever debug thing I want with a local filename I want 
     * This is specifically for individual images, but will be superceded by unittesting.
     * @param {*} filename 
     * @param {*} withLambda 
     * @returns 
     */
    async debugRun (filename = null, withLambda = false) {
        filename ??= TEST_FILENAME
        console.log(`Running debug! ${filename}`)
        console.log(`Working directory: ${path.resolve()}`)

        this.handleImage(filename);
        return;
        
        let mng = new UserNameBinarization(filename, true)

        // await this.validateMarblesPreRaceScreen(mng);
        let race_screen = mng.validateMarblesPreRaceScreen()
        console.log(`Race bool ${race_screen}`)
        
        
        const withNative = true

        if (withLambda) {
            console.log("Using lambda debug")
            let debugStart = performance.now();
            await this.warmupLambda(1)
            await mng.buildBuffer().catch( err => {console.error(`Buffer build errored! ${err}`); throw err})
            mng.orig_buffer = mng.buffer // TODO: Is this being used?
            console.log(`Built buffer in ${msToHUnits(performance.now() - debugStart, true, 0)}`)

            return mng.dumpInternalBuffer()
            .then( ({buffer, imgMetadata, info}) => {
                debugStart = performance.now(); 
                return this.sendImgToLambda(buffer, imgMetadata, info, 'test', false)
            })
            .then( ({raw, data, info, jobId}) => {
                if (raw)
                    data = this.parseHOCRResponse(raw)
                console.debug(`Lambda complete job-${jobId}`); 
                console.log(`Lambda Recognized in ${msToHUnits(performance.now() - debugStart, true, 0)}`)
                return {mng: mng, data: data}
            })
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
            console.log(`Built buffer in ${msToHUnits(performance.now() - debugStart, true, 0)}`)
            debugStart = performance.now();
            return mng.isolateUserNames()
        })
        .then(  buffer => {
            console.log(`Binarized in ${msToHUnits(performance.now() - debugStart, true, 0)}`)
            debugStart = performance.now();
            if (withNative) {
                return this.nativeTesseractProcess(buffer)
            }
            return this.scheduleTextRecogn(buffer)})
        .then(  tsData => { 
            console.log(`Recognized in ${msToHUnits(performance.now() - debugStart, true, 0)}`)
            return {mng: mng, data: tsData.data} 
        })
        .catch(
            err => {
                console.error(`Debug: An unknown error occurred ${err}.${err.stack}`)
                throw err
            }
        )
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
     * @param {String} channel URL to start streamlink download
     * @param {boolean} [vodDumpFlag=false] dump images to disk for debug
     */
    start (channel, vodDumpFlag=false) {
        let retText = 'Already started'

        if (vodDumpFlag) {
            console.log(`Setting vodDump to ${vodDumpFlag}`)
            this.debug_obj.vod_dump = vodDumpFlag
        }

        if (this.streamlinkProcess === null) {
            this.clear()
            
            this.OCRManager.warmUp()

            // if (!this.uselambda)
            //     this.setupWorkerPool(NUM_LIVE_WORKERS)
            // else 
            //     this.warmupLambda(NUM_LAMBDA_WORKERS)
                // this.lambdaClient = new LambdaClient(AWS_LAMBDA_CONFIG)
            
            this.startStreamMonitor(channel)

            retText = "Waiting for names"
        }
        return {"state": this.ServerState.state, "text": retText}
    }

    stop () {
        let resp_text = "Already Stopped"

        if (!this.ServerState.stopped) {
            this.spinDown()

            resp_text = "Stopped image parser"
            this.ServerState.enterStopState()
        }

        this.debug_obj.vod_dump = false;

        return {"state": this.ServerState.state, "text": resp_text}
    }

    /** 
     * Clear all state objects to get back to a neutral state
     * To be used when clearing all usernames & state for a brand-new reading
     */
    clear () {
        console.log("Clearing server state")
        this.StreamImage.reset()
        this.ServerState.clear()
        this.usernameTracker.clear()

        return "Cleared server state."
    }

    /** 
     * User ping for getting server status 
     * @param {*} req request
     * @returns {Object} user-status object
     */
    status (req) {

        const curr_dt = Date.now()
        this.ServerState.allViewers.add(req.ip)
        
        while (this.ServerState.monitoredViewers.at(0) < curr_dt + 300)
            this.ServerState.monitoredViewers.shift()

        if (req.query?.admin != undefined) {
            // TODO: Use a different page + endpoint
        } else {
            // Track viewers
            this.ServerState.monitoredViewers.push(Date.now() + ServerStatus.DEFAULT_VIEWER_INTERVAL) // TODO: Link client to this value
        }

        return {
            'status': this.ServerState.toJSON(),
            'streaming': this.ServerState.streamingTime,
            'userList': this.usernameTracker.status(),
        }
    }

    find (reqUsername) {
        return this.usernameTracker.find(reqUsername)
    }

    getImage (reqUsername) {
        return this.usernameTracker.getImage(reqUsername)
    }

    list () {
        return this.usernameTracker.getReadableList()
    }

    async debug (filename, withLambda, waitTest=false, raceTest=false) {
        // TODO: Add waitTest & raceTest separately as params

        return this.debugRun(filename, withLambda)
        .then( async ({mng, data}) => {
            // TODO: Fix resync
            console.log("Got data:", data)
            let retList = await this.usernameTracker.addPage(data, mng.bufferToPNG(mng.orig_buffer, true, false), mng.bufferSize, Date.now())
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
        // setup workers
        if (this.uselambda)
            this.warmupLambda(NUM_LAMBDA_WORKERS)
        else if (this.withNative)
            ;
        else 
            this.setupWorkerPool(NUM_LIVE_WORKERS)
            

        const promiseList = []
        let ignoreFrames = 60;

        for (const fileName of fileList) {
            if (fileName.endsWith('txt')) {
                nameFileContents = fs.readFile(path.resolve(folderName, fileName),  { encoding: 'utf8' })
                continue
            }
            if (ignoreFrames-- > 0) continue;
            // if (ignoreFrames < -100) continue;

            // send each image file to parse
            const file = await fs.readFile(path.resolve(folderName, fileName))
            promiseList.push(this.parseImgFile(file)) // filename works but I want to read
            console.debug(`Parsing image file ${fileName}`)
            await setTimeout(200); // forcing sleep so my computer doesn't explode
        }

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
                map.set(score, (map.get(score) || 0) + 1);
                if (score > 1) {
                    nonPerfectCount++;
                    nonPerfectAvg += score
                }
            }

            console.debug(`All scores: ${Array.from(map.entries()).sort().map(([key, val]) => `${[key]}=${val}`).join('\n')} `)
            console.debug(`Final score: ${totalScore}, mean: ${totalScore/nameList.length}`)
            console.debug(`median: ${median}, avg-non-perfect ${nonPerfectAvg/nonPerfectCount}`)
            console.debug(`Not found list [${notFound.length}]: \n${notFound.join(', ')}`)
            console.debug(`Completed test in ${((ed-st)/(60*1000)).toFixed(3)}m`)
        })
        

        return {test:"testing ongoing!"}
    }
}