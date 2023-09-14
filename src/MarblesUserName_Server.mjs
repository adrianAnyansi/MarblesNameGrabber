// Node Server that manages, saves and processes images for MarblesNameGrabber

import path from 'node:path'
import { spawn } from 'node:child_process'

import {MarbleNameGrabberNode} from "./MarblesNameGrabberNode.mjs"
import {UsernameTracker} from './UsernameTrackerClass.mjs'

import { createWorker, createScheduler } from 'tesseract.js'
import { humanReadableTimeDiff } from './DataStructureModule.mjs'
// import { setInterval } from 'node:timers'

// server state
const SERVER_STATE_ENUM = {
    STOPPED: 'STOPPED',
    RUNNING: 'RUNNING',
    READING: 'READING',
    COMPLETE: 'COMPLETE'
}

const TWITCH_URL = 'https://www.twitch.tv/'
const DEBUG_URL = 'https://www.twitch.tv/videos/1891700539?t=2h30m20s' // "https://www.twitch.tv/videos/1895894790?t=06h39m40s"
const LIVE_URL = 'https://www.twitch.tv/barbarousking'
let defaultStreamURL = DEBUG_URL
// const streamlinkCmd = ['streamlink', defaultStreamURL, 'best', '--stdout']

let ffmpegFPS = '2'
// const ffmpegCmd = ['ffmpeg', '-re', '-f','mpegts', '-i','pipe:0', '-f','image2pipe', '-pix_fmt','rgba', '-c:v', 'png', '-vf',`fps=fps=${ffmpegFPS}`, 'pipe:1']

let pngChunkBufferArr = []
const PNG_MAGIC_NUMBER = 0x89504e47 // Number that identifies PNG file

const TEST_FILENAME = "testing/test.png"
// const LIVE_FILENAME = "live.png"

export class MarblesAppServer {
    
    constructor () {
        this.serverStatus = {
            state: SERVER_STATE_ENUM.STOPPED,
            imgs_downloaded: 0,
            imgs_read: 0,
            started_stream_ts: null,
        }

        // debug variables
        this.debugTesseract = false;
        this.debugProcess = false;

        this.pngChunkBufferArr = []

        // Processors & Commands
        this.streamlinkCmd = ['streamlink', defaultStreamURL, 'best', '--stdout']
        this.ffmpegCmd = ['ffmpeg', '-re', '-f','mpegts', '-i','pipe:0', '-f','image2pipe', '-pix_fmt','rgba', '-c:v', 'png', '-vf',`fps=fps=${ffmpegFPS}`, 'pipe:1']
        this.streamlinkProcess = null
        this.ffmpegProcess = null

        // Tesseract variables
        this.OCRScheduler = null
        this.numOCRWorkers = 0

        this.usernameList = new UsernameTracker()
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
        return this.OCRScheduler.terminate()
        // TODO: Change this to just terminate some workers?
    }

// -------------------------
// Server processing functions
// -------------------------
    /**
     * Start downloading channel or vod to read
     * @param {String} twitch_channel 
     * @returns 
     */
    startStreamMonitor(twitch_channel=null) {
        // Start process for stream url

        if (this.streamlinkProcess) return // TODO: Return error

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

        
        // Print start/running depending on ffmpeg output
        if (this.debugProcess) {
            this.streamlinkProcess.stderr.on('data', (data) => {
                console.log(data.toString())
            })
        } else {
            let outputBuffer = false
            this.streamlinkProcess.stderr.on('data', (data) => {
                const stringOut = data.toString()
                if (!outputBuffer & stringOut.includes('Opening stream')) {
                    outputBuffer = true
                    console.debug('Streamlink is downloading stream-')
                }
            })
        }

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

            let lastIdx = 0
            let lead_idx = 0

            while (lead_idx+4 <  partialPngBuffer.length) {
                if (partialPngBuffer.readUInt32BE(lead_idx) == PNG_MAGIC_NUMBER) {
                    // if (lead_idx % 4 != 0) console.error(`offset did not end at 0`)
                    // console.debug(`Offset started at ${lead_idx} and ${lead_idx%4}`)

                    if (lead_idx != lastIdx)
                        this.pngChunkBufferArr.push(partialPngBuffer.slice(lastIdx, lead_idx))

                    if (this.pngChunkBufferArr.length > 0) {
                        // Buffer is complete, do effort
                        const pngBuffer = Buffer.concat(this.pngChunkBufferArr)
                        this.pngChunkBufferArr.length = 0 // clear array
                        // console.log(`Got PNG Buffer size:${pngBuffer.length}`)
                        // TODO: Debug flag
                        // fs.writeFileSync('process-stdout.png', pngBuffer, 
                        //     err => console.error(`You failed a thing ${err}`))
                        this.parseImgFile(pngBuffer)
                    }

                    lastIdx = lead_idx
                }
                lead_idx += 4
            }

            // copy remainder into here
            this.pngChunkBufferArr.push(partialPngBuffer.subarray(lastIdx)) // push shallow-copy of buffer here

        })

        this.streamlinkProcess.on('close', () => {
            console.debug('Streamlink process has closed.')
            this.serverStatus.state = SERVER_STATE_ENUM.STOPPED
        })
        this.ffmpegProcess.on('close', () => console.debug('FFMpeg process has closed.'))

        console.debug("Started up streamlink->ffmpeg buffer")
    }

    async parseImgFile(imageLike) {

        this.serverStatus.imgs_downloaded += 1

        let currTs = (new Date()).getTime()
        
        const options = {
            "id": `file_dt_${currTs}`,
            "jobId": `file_dt_${currTs}`,
        } // TODO: Use options
        
        let mng = new MarbleNameGrabberNode(imageLike, false)

        console.debug(`Queuing LIVE image queue: ${this.OCRScheduler.getQueueLen()}`)

        return mng.buildBuffer()
        .catch( err => {
            console.warn("Buffer was not created successfully, skipping")
            throw err
        }).then( () =>  mng.isolateUserNames()
        ).then( buffer =>  this.scheduleTextRecogn(buffer)
        ).then( ({data, info}) => {
            // add to nameBuffer
            this.serverStatus.imgs_read += 1
            let retList = this.usernameList.addPage(data, mng.bufferToPNG(mng.buffer, true, false))
            console.debug(`UserList is now: ${this.usernameList.length}, last added: ${retList.at(-1)}`)
        }).catch ( err => {
            console.warn(`Error occurred ${err}, execution exited`)
            // Since this is continous, this info is discarded
        })
    }

    async debugRun (filename = null) {
        filename ??= TEST_FILENAME
        console.log(`Running debug! ${filename}`)
        console.log(`Working directory: ${path.resolve()}`)
        
        await setupWorkerPool(1)

        let mng = new MarbleNameGrabberNode(filename, true)
        
        return mng.buildBuffer()
        .catch( err => {
            console.warn("Buffer was not created successfully, skipping")
            throw err
        })
        .then(  () => mng.isolateUserNames() )
        .then(  buffer => this.scheduleTextRecogn(buffer)    )
        .then(  tsData => { return {mng: mng, data: tsData.data} })
        .catch(
            err => {
                console.error(`Debug: An unknown error occurred ${err}`)
                throw err
            }
        )
    }

    // Tesseract.js
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
            // tessedit_pageseg_mode: '11',      // read individual characters (this is more likely to drop lines)
        })

        console.debug(`Tesseract Worker ${worker_num} is built & init`)
        this.OCRScheduler.addWorker(tesseractWorker)
        return tesseractWorker

    }

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
     * Setup worker pool
     * @param {String} channel
     */
    start (channel) {
        let retText = 'Already running'

        if (this.streamlinkProcess == null) {
            this.usernameList.clear()
            
            this.setupWorkerPool(2)
            this.startStreamMonitor(channel)

            this.serverStatus.started_stream_ts = new Date()
            this.serverStatus.state = SERVER_STATE_ENUM.RUNNING
            retText = "Started Running"
        }
        return {"state": this.serverStatus.state, "text": retText}
    }

    stop () {
        let resp_text = "Stopped"
        if (this.streamlinkProcess) {
            // console.log("Stopping image parser")
            // TODO: Stop workers without killing the scheduler

            this.streamlinkProcess.kill()
            this.ffmpegProcess.kill()
            // console.log("Killed streamlink processes")

            this.streamlinkProcess = null
            this.ffmpegProcess = null

            resp_text = "Stopped image parser"
            this.serverStatus.state = SERVER_STATE_ENUM.STOPPED
        }

        return {"state": this.serverStatus.state, "text": resp_text}
    }

    clear () {
        this.usernameList.clear()
        return "Cleared usernameList."
    }

    status () {
        return {
            'status': this.serverStatus,
            'job_queue': this.OCRScheduler ? this.OCRScheduler.getQueueLen() : 'X',
            'streaming': humanReadableTimeDiff(Date.now() - this.serverStatus.started_stream_ts),
            'userList': this.usernameList.status()
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
            let users = this.usernameList.find(reqUsername, 7)
            
            let levDist = users.at(0) ? users.at(0)[0] : Infinity
            let matchDist = 4
            // now score based on distance
            if (levDist < 2) 
                matchDist = 1
            else if (levDist < 5)
                matchDist = 2
            else if (levDist < 8)
                matchDist = 3
            
            return {'userObj': users.at(0)?.[1], 'match': matchDist }
        }
    }

    getImage (reqUsername) {
        return this.usernameList.getImage(reqUsername)
    }

    getFullImg(reqId) {
        return this.usernameList.getFullImg(reqId)
    }

    list () {
        return Object.fromEntries(this.usernameList.hash)
    }

    debug (filename) {

        this.debugRun(filename)
        .then( ({mng, data}) => {
            let retList = this.usernameList.addPage(data, mng.bufferToPNG(mng.orig_buffer, true, false))
            res.send({list: retList, debug:true})
            console.debug("Sent debug response")
        })
        
        // ELSE RAISE ERROR
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
