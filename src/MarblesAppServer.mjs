// Node Server that manages, saves and processes images for MarblesNameGrabber

import path from 'node:path'
import { ChildProcess, spawn } from 'node:child_process'
import axios from 'axios'
import fs from 'fs/promises'
import fsAll from 'fs'

import { UserNameBinarization } from './UsernameBinarization.mjs'
import {UsernameAllTracker, TrackedUsername} from './UsernameTrackerClass.mjs'

import { msToHUnits } from './DataStructureModule.mjs'
import { setTimeout } from 'node:timers/promises'
import { SharpImg } from './UtilModule.mjs'
import { StreamingImageBuffer, ServerStatus, StreamImageTracking, ScreenState } from './ServerClassModule.mjs'
import { NativeTesseractOCRManager, OCRManager, LambdaOCRManager } from './OCRModule.mjs'

const TWITCH_URL = 'https://www.twitch.tv/'
const LIVE_URL = 'https://www.twitch.tv/barbarousking'

const VOD_DUMP_LOC = "testing/vod_dump/"

let TWITCH_ACCESS_TOKEN_BODY = null
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
const TWITCH_CHANNEL_INFO_URL = "https://api.twitch.tv/helix/channels"
const TWITCH_DEFAULT_BROADCASTER = "barbarousking" // Default twitch channel
const TWITCH_DEFAULT_BROADCASTER_ID = "56865374" // This is the broadcaster_id for barbarousking
const TWITCH_CRED_FILE = 'twitch_creds.json'


export class MarblesAppServer {

    /** Determines some programs/settings */
    static ENV = 'dev' // set from router

    // TODO: Change tesseract cmd in object
    static TESSERACT_LOC = String.raw`C:\Program Files\Tesseract-OCR\tesseract.exe`
    
    // Needs to handle both linux for prod and windows for dev
    static FFMPEG_LOC = String.raw`C:\Program Files\Streamlink\ffmpeg\ffmpeg.exe` // NOTE: should work on all streamlink installations
    static STREAMLINK_LOC = 'streamlink' // on PATH

    /** FPS to view stream */
    static FFMPEG_FPS = '30'
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
            user_bin: true
        }

        // debug variables
        // this.debugTesseract = false;
        // this.debugLambda = false;

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
        // if (this.debugLambda)  AWS_LAMBDA_CONFIG["logger"] = console
        // this.lambdaClient = new LambdaClient(AWS_LAMBDA_CONFIG)
        // this.uselambda = USE_LAMBDA
        /** @type {LambdaClient} AWS lambda */
        // this.lambdaClient = null
        // this.lambdaQueue = 0    // Keep track of images sent to lambda for processing

        // Username Tracking
        // ==================================================
        // /** @type {UsernameTracker} Userlist for server */
        // this.usernameList = new UsernameTracker() 
        /** @type {UsernameAllTracker} Userlist but better */
        this.usernameTracker = new UsernameAllTracker()

        // Server Variables
        // ================================================
        // this.serverStatus_obj = {
            // state: SERVER_STATE_ENUM.STOPPED,   // current state
            // viewers: 0,                         // current viewers on the site
            // interval: 1_000 * 3,                 // interval to refresh status
            // lag_time: 0                         // time behind from 
        // }

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
     * 
     * @param {string} [videoSource=null] if null, use pipe:0 (stdin)
     */
    startFFMPEGProcess(videoSource=null) {
        console.log("Starting ffmpeg process")

        const ffmpegCMD = this.ffmpegCmd.slice() // copy array
        if (videoSource)
            ffmpegCMD[3] = videoSource

        this.ffmpegProcess = spawn(ffmpegCMD[0], ffmpegCMD.slice(1), {
            stdio: ['pipe', 'pipe', 'pipe']
        })

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
        this.ffmpegProcess.on('error', () => {
            console.warn("An unknown error occurred while writing FFMpeg process.")
        })
        this.ffmpegProcess.on('close', () => {
            console.debug('FFMpeg process has closed.')
            // NOTE: Ignoring the spinDown server state as both shutdown each other
            this.ServerState.enterStopState()
        })

        console.log("Setup FFMPEG Process")
    }

    /**
     * Shutdown streamlink & ffmpeg processes
     * @returns {Boolean} wasShutdown
     */
    shutdownStreamMonitor() {

        if (this.streamlinkProcess) {
            console.log("Stopping processes & image parser")

            if (this.streamlinkProcess) {
                this.streamlinkProcess.kill('SIGINT')
            } else if (this.ffmpegProcess) {
                // Only kill if streamlinkProcess is not piping
                this.ffmpegProcess.kill('SIGINT')   // Trying to use SIGINT for Linux
            }
            // console.log("Killed streamlink processes")

            this.streamlinkProcess = null
            this.ffmpegProcess = null
            return true
        }

        return false
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
            fs.writeFile(`${VOD_DUMP_LOC}${imgId}.${this.streamImgFormat[0]}`, imageLike)
        }

        const EMPTY_IMAGE_NUM = parseInt(MarblesAppServer.FFMPEG_FPS) * 3
        if (this.ScreenState.frames_without_names > EMPTY_IMAGE_NUM) {
            console.log(`Found ${EMPTY_IMAGE_NUM} empty frames @ ${imgId};
                Dumping remaining images and changing to COMPLETE state.`)
            this.ServerState.enterCompleteState()
            this.spinDown()
            return
        }

        return this.parseAdvImg(imageLike)
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
     * @param {number} processImgId img_processed image
     */
    async queueIndividualOCR (user, visibleIdx, mng, processImgId) {
        // crop image
        user.ocr_processing = true;
        const binPerf = performance.now()
        const sharpBuffer = await mng.cropTrackedUserName(visibleIdx, user.length)
        // console.log(`Queuing OCR user vidx: ${visibleIdx} index ${user.index}`)

        const binUserImg = await mng.binTrackedUserName([sharpBuffer])
        if (this.debug_obj.user_bin)
            console.log(`bin #${processImgId} @ ${visibleIdx} took ${(performance.now() - binPerf).toFixed(2)}ms`)

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

    /**
     * Run a marbles test using either a source folder or video
     * @param {string} source 
     * @param {OCRTypeEnum} ocrType 
     * @param {boolean} [vodDump=false]
     */
    async localTest (source, ocrType, vodDump=false) {

        if (fsAll.statSync(source).isDirectory()) {
            
            const fileList = await fs.reaaddir(source);
            fileList.sort( (fileA, fileB) => {
                return parseInt(fileA.split('.')[0]) - parseInt(fileB.split('.')[0])
            })

            if (fileList == null)
                throw new Error("Invalid folder, folder is empty/DNE")

            console.log(`Running test on ${source}`)
            this.ServerState.enterWaitState()
            const st = performance.now();
            // TODO: Change based on OCR type
            this.OCRManager.warmUp();

            const filePromiseList = []
            for (const fileName of fileList) {
                if (fileName.endsWith('txt')) {
                    continue // NOTE: Going to provide this separately
                }

                const filepath = path.resolve(source, fileName)
                console.debug(`Parse filename ${fileName}`)
                filePromiseList.push(this.handleImage(filepath))
                // Wait FPS time
                await setTimeout( ()=> {}, 1_000 / parseInt(this.FFMPEG_FPS))
            }
            
            this.ServerState.enterStopState()
            const ed = performance.now();
            console.log(`Test run took ${(ed-st).toFixed(2)}ms`)
        } else {
            // source is video
            // technically this should copy start() and use that flow
            // I have todo manual stuff instead here
            this.clear()
            this.ServerState.enterWaitState()
            this.debug_obj.vod_dump = vodDump
            this.startFFMPEGProcess(source)
            // everything runs on server
        }

        return {test: "Runnin test"}
    }

    async testAgainstList(text_list=null, source_file=null) {

        const st = performance.now();
        /** @type {string[]} list of users to test against */
        let user_list = null
        if (text_list) 
            user_list = text_list
        else if (source_file) {
            const source_content = await fs.readFile(source_file, { encoding: 'utf8'})
            user_list = source_content.split('\r\n') // windows line endings
        }

        console.debug(`Test against name list, len: ${user_list.length}`)

        let totalScore = 0;
        const [scoreArr, notFound] = [[], []];

        for (const [idx, name] of user_list.entries()) {
            const list = this.find(name)
            const bestDistScore = list[0][0]
            scoreArr.push(bestDistScore)
            totalScore += bestDistScore;
            if (bestDistScore > 7) {
                notFound.push(`[${idx}]${name}`)
            }
        }

        scoreArr.sort();
        const median = scoreArr[Math.round(scoreArr.length/2)]

        const map = new Map();
        let [nonPerfectAvg, nonPerfectCount] = [0,0];
        for (const score of scoreArr) {
            map.set(score, (map.get(score) ?? 0) + 1)
            if (score > 1) {
                nonPerfectCount++
                nonPerfectAvg += score
            }
        }

        console.debug(`Score Map: ${Array.from(map.entries()).sort().map(([key, val]) => `${[key]}=${val}`).join('\n')} `)
        console.debug(`Final score: ${totalScore}, mean: ${totalScore/nameList.length}`)
        console.debug(`median: ${median}, avg-non-perfect ${nonPerfectAvg/nonPerfectCount}`)
        console.debug(`Not found list [${notFound.length}]: \n${notFound.join(', ')}`)
        // console.debug(`Completed test in ${((ed-st)/(60*1000)).toFixed(3)}m`)
        
    }
}