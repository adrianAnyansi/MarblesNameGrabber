// Node Server that manages, saves and processes images for MarblesNameGrabber

import path from 'node:path'
import { ChildProcess, spawn } from 'node:child_process'
import axios from 'axios'
import fs from 'fs/promises'
import fsAll from 'fs'

import { VisualUsername, TrackedUsername } from './UserModule.mjs'
import { UserNameBinarization } from './UserNameBinarization.mjs'
import {UsernameAllTracker, UsernameSearcher} from './UsernameTrackerClass.mjs'

import { setTimeout } from 'node:timers/promises'
import { SharpImg } from './ImageModule.mjs'
import { StreamingImageBuffer, ServerStatus, StreamImageTracking, ScreenState } from './ServerClassModule.mjs'
import { OCRManager, OCRTypeEnum, getOCRModule } from './OCRModule.mjs'
import { formatMap, iterateN, iterateRN, Stopwatch, trimObject } from './UtilityModule.mjs'


let TWITCH_ACCESS_TOKEN_BODY = null
const TWITCH_URL = 'https://www.twitch.tv/'
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
const TWITCH_CHANNEL_INFO_URL = "https://api.twitch.tv/helix/channels"
const TWITCH_DEFAULT_BROADCASTER = "barbarousking" // Default twitch channel
const TWITCH_DEFAULT_BROADCASTER_ID = "56865374" // This is the broadcaster_id for barbarousking
const TWITCH_CRED_FILE = 'twitch_creds.json'

const VOD_DUMP_LOC = "testing/vod_dump/"
const LOG_OUTPUT_FILE = 'testing/vod_out.txt'
const USR_OUTPUT_FILE = 'testing/usr_out.txt'

export class MarblesAppServer {
    
    /** ffmpeg location */
    static FFMPEG_LOC = String.raw`C:\Program Files\Streamlink\ffmpeg\ffmpeg.exe` // NOTE: should work on all streamlink installations
    /** streamlink location */
    static STREAMLINK_LOC = 'streamlink' // on PATH

    /** FPS to view stream */
    static FFMPEG_FPS = 30
    /** number of seconds without any valid names on them */
    static EMPTY_PAGE_COMPLETE = 5
    /** default  */
    static DEFAULT_STREAM_URL = `${TWITCH_URL}${TWITCH_DEFAULT_BROADCASTER}`

    constructor () {
        // Server state objects
        // ===============================================

        /** Format to output images to ffmpeg */
        this.streamImgFormat = StreamingImageBuffer.JPG_FORMAT

        /** @type {ScreenState} Keep track of state of screen during parsing */
        this.ScreenState = new ScreenState()
        /** @type {StreamImageTracking} used to parse streaming buffer into images */
        this.StreamImage = new StreamImageTracking(this.streamImgFormat)
        /** @type {ServerStatus} Track overall server status for outside observation */
        this.ServerStatus = new ServerStatus()
        
        // Debug variables ===========================================
        this.debug_obj = {
            process: false, // debug ffmpeg/streamlink processes
            vod_dump: false, // dump images to folder
            screen_state_log: true, // output the 
            write_screen_state_to_file: true, // write run to file
            user_bin: false, // show logs for username binarization & empty failed ocr
            ocr_debug_flag: false, // turn on OCR class debug flag
            ocr_output: false, // add log for failed ocr checks
            disable_ocr: false, // disable OCR checking
            disable_ocr_len: false, // disable pre OCR length check
            frame_pacing: false // track & output fps
        }

        // Processes for ffmpeg & streamlink
        // ========================================================
        /** @type {ChildProcess} Node process for streamlink */
        this.streamlinkProcess = null
        /** @type {ChildProcess} Node process for ffmpeg */
        this.ffmpegProcess = null
        
        // Twitch tokens & vars
        // ==============================================
        /** Twitch monitoring */
        this.twitch_monitor = {
            enable: false,
            last_game_name: null,
            broadcaster_id: TWITCH_DEFAULT_BROADCASTER_ID,
            access_token: null,
        }

        // Start up the Twitch game monitor
        if (this.twitch_monitor.enable)
            this.setupTwitchMonitor()

        /** @type {OCRManager} OCR to manage */
        this.OCRManager = getOCRModule(OCRTypeEnum.LAMBDA, 
            {concurrency:6, debug: this.debug_obj.ocr_debug_flag})

        /** @type {UsernameAllTracker} Userlist but better */
        this.usernameTracker = new UsernameAllTracker();
    }

    /**
     * Setup server config from file.
     */
    setConfig(config_json) {
        // Set config level variables from file
        MarblesAppServer.FFMPEG_LOC = config_json.commands?.ffmpeg ?? MarblesAppServer.FFMPEG_LOC
        MarblesAppServer.STREAMLINK_LOC = config_json.commands?.streamlink ?? MarblesAppServer.STREAMLINK_LOC

        // Set core attributes
        // Need a better way to reset these attributes instead of coding here
        MarblesAppServer.FFMPEG_FPS = config_json.core?.fps ?? MarblesAppServer.FFMPEG_FPS
        this.debug_obj.ocr_debug_flag = config_json.debug?.ocr_debug_flag ?? this.debug_obj.ocr_debug_flag
        if (config_json?.core?.ocr) {
            this.OCRManager = getOCRModule(config_json.core.ocr, {concurrency:6, debug: this.debug_obj.ocr_debug_flag})
        }
        
        this.twitch_monitor.enable = config_json.core?.enable_twitch_monitor ?? this.twitch_monitor.enable
        if (this.twitch_monitor.enable)
            this.setupTwitchMonitor()
        
        // NOTE: The stream image format setting is linked to the streamingImage and likely will not be supported
        // JPG is a huge performance increase and it's unnecessary to support PNG anymore.

        // debug objs, all runtime variables
        this.debug_obj.process                      = config_json.debug?.process ?? this.debug_obj.process                    
        this.debug_obj.vod_dump                     = config_json.debug?.vod_dump ?? this.debug_obj.vod_dump                   
        this.debug_obj.screen_state_log             = config_json.debug?.screen_state_log ?? this.debug_obj.screen_state_log           
        this.debug_obj.frame_pacing                 = config_json.debug?.frame_pacing ?? this.debug_obj.frame_pacing               
        this.debug_obj.write_screen_state_to_file   = config_json.debug?.write_screen_state_to_file ?? this.debug_obj.write_screen_state_to_file 
        this.debug_obj.user_bin                     = config_json.debug?.user_bin ?? this.debug_obj.user_bin                   
        
        this.debug_obj.ocr_output                   = config_json.debug?.ocr_output ?? this.debug_obj.ocr_output                 
        this.debug_obj.disable_ocr                  = config_json.debug?.disable_ocr ?? this.debug_obj.disable_ocr                
        this.debug_obj.disable_ocr_len              = config_json.debug?.disable_ocr_len ?? this.debug_obj.disable_ocr_len            

        console.log("Completed server config setup.")
    }

    // -------------------------
    // Server processing functions
    // -------------------------
    /**
     * Start downloading channel or vod to read
     * starts streamlink -> ffmpeg processing
     * Note this also setups variables assuming a state changing going to START
     * @param {String} twitch_channel 
     */
    startStreamMonitor(twitch_channel=null) {
        // Start process for stream url

        if (this.streamlinkProcess) return // TODO: Return error

        this.ServerStatus.enterWaitState()

        const streamlinkARGS = [
            twitch_channel ? TWITCH_URL + twitch_channel : MarblesAppServer.DEFAULT_STREAM_URL, 
            'best', '--stdout'];

        console.debug(`Starting monitor in directory: ${process.cwd()}\n`+
                        `Watching stream url: ${streamlinkARGS[0]}`)
        if (this.debug_obj.vod_dump) {
            console.debug(`Stream is dumped to location ${VOD_DUMP_LOC}`)
            fs.mkdir(`${VOD_DUMP_LOC}`, {recursive: true})
        }

        this.streamlinkProcess = spawn(MarblesAppServer.STREAMLINK_LOC, streamlinkARGS, {
            stdio: ['inherit', 'pipe', 'pipe']
        })
        this.startFFMPEGProcess()

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

        // Error-handling
        this.streamlinkProcess.on('error', (err) => {
            console.warn("An unknown error occurred while writing Streamlink process." + err)
        })

        // Closed handling
        this.streamlinkProcess.on('close', () => {
            console.debug('Streamlink process has closed.')
            this.spinDown()
            this.ServerStatus.enterStopState()
        })
        console.debug("Set up streamlink processes")
    }

    /**
     * 
     * @param {string} [videoSource=null] if null, use pipe:0 (stdin)
     */
    startFFMPEGProcess(videoSource=null) {
        console.log("Starting ffmpeg process")

        const ffmpegARGS = ['-re', '-i','pipe:0', '-f','image2pipe', 
                            '-c:v', ...this.streamImgFormat[1],
                            '-vf', `fps=${MarblesAppServer.FFMPEG_FPS}`, 'pipe:1']

        if (videoSource)
            ffmpegARGS[2] = videoSource

        console.debug(`Starting ffmpeg process with args ${this.streamImgFormat[1]} & FPS: ${MarblesAppServer.FFMPEG_FPS}`)
        this.ffmpegProcess = spawn(MarblesAppServer.FFMPEG_LOC, ffmpegARGS, {
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
                // if (this.debug_obj.frame_pacing)
                    this.ServerStatus.frame_dl_time[this.StreamImage.imgs_downloaded] = performance.now()
                this.handleImage(newFrameBuffer, this.StreamImage.imgs_downloaded)
            }
        })
        this.ffmpegProcess.on('error', () => {
            console.warn("An unknown error occurred while writing FFMpeg process.")
        })
        this.ffmpegProcess.on('close', () => {
            console.debug('FFMpeg process has closed.')
            // NOTE: Ignoring the spinDown server state as both shutdown each other
            this.ServerStatus.enterStopState()
        })

        console.log("Setup FFMPEG Process")
    }

    /**
     * Shutdown streamlink & ffmpeg processes
     * @returns {Boolean} wasShutdown
     */
    shutdownStreamMonitor() {

        if (this.streamlinkProcess || this.ffmpegProcess) {
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
     * Stop stream-monitor, stop OCR but do not clear state
     * reset base parameters
     */
    spinDown () {
        this.shutdownStreamMonitor()
        if (this.OCRManager)
            this.OCRManager.shutdown()
        this.writeRunToFile()
        if (this.ServerStatus.localListSource) {
            this.testAgainstList(null, this.ServerStatus.localListSource)
            this.ServerStatus.localListSource = null
        }
    }

    async writeRunToFile () {

        if (this.debug_obj.write_screen_state_to_file) {
            
            const fileStrBuffer = []
            
            fileStrBuffer.push(`Start: Header ${Date.now()}`) // TODO: Improve this to show marbles start/end

            const outString = this.ScreenState.visibleScreenFrame.map(
                (val, idx) => {
                    const frameObj = this.ScreenState.frameObj[idx]
                    const imgId = frameObj.frame_num
                    const frame_time = `${this.ServerStatus.frameTiming(imgId).toFixed(2)}ms`
                    trimObject(frameObj.len_obj)
                    return [ 'V: '+this.ScreenState.visibleScreenFrame[idx],
                             'P: '+this.ScreenState.predictedFrame[idx],
                             'Obj: '+JSON.stringify(frameObj),
                             `------ end frame: ${imgId} | ${frame_time} -------`].join('\n') 
                }
            ).join('\n')
            // fileStrBuffer.push(outString)
            await fs.writeFile(USR_OUTPUT_FILE, outString, {flag: 'w'})
            console.log("Wrote all output to user out file")

            const userListString = JSON.stringify(
                this.usernameTracker.getReadableList(),
                null,
                4
            )
            fileStrBuffer.push(userListString)

            const frameTimeString = 
            [`Color Avg: ${UserNameBinarization.COLOR_SW_STAT.mean.toFixed(2)}ms`,
            `Quick length Avg: ${UserNameBinarization.QL_SW_STAT.mean.toFixed(2)}ms `,
            `Length Avg: ${UserNameBinarization.LEN_SW_STAT.mean.toFixed(2)}ms`].join('\n')

            fileStrBuffer.push(frameTimeString)
            
            await fs.writeFile(LOG_OUTPUT_FILE, fileStrBuffer.join('\n'), {flag: 'w'})
            console.log("Wrote all output to vod out file")
        }
    }

    /**
     * Handle image before per-frame calculations
     * Stops processing if not available
     * @param {import('./ImageModule.mjs').ImageLike} imageLike 
     * @param {number} imgId unique id for image
     */
    async handleImage(imageLike, imgId) {
        if (this.ServerStatus.notRunning) {
            console.debug(`In COMPLETE/STOP state, dropping image.`)
            return
        }

        if (this.debug_obj.vod_dump) {
            const temp_process_id = this.StreamImage.imgs_processed == 0 
                ? this.StreamImage.imgs_processed
                : ''
            fs.writeFile(`${VOD_DUMP_LOC}${temp_process_id}_${imgId}.${this.streamImgFormat[0]}`, imageLike)
        }

        const EMPTY_IMAGE_NUM = MarblesAppServer.EMPTY_PAGE_COMPLETE * MarblesAppServer.FFMPEG_FPS
        if (this.ScreenState.frames_without_names > EMPTY_IMAGE_NUM) {
            console.log(`Found ${EMPTY_IMAGE_NUM} empty frames @ ${imgId};
                Dumping remaining images and changing to COMPLETE state.`)
            this.ServerStatus.enterCompleteState()
            this.spinDown()
            return
        }

        await this.parseAdvImg(imageLike, imgId)
    }

    /** Parse advanced image per frame
     * Need a complex state machine to handle this
     * @param {import('./ImageModule.mjs').ImageLike} imageLike 
     */
    async parseAdvImg(imageLike, imgId) {

        this.ServerStatus.frame_st_time[imgId] = performance.now()
        
        const mng = new UserNameBinarization(imageLike, false)
        mng.buildBuffer(); // Build buffer early*

        // TODO: Rework this and also check for obstructions
        if (this.ServerStatus.wait) {
            const validMarblesImgBool = await mng.validateMarblesPreRaceScreen()

            if (validMarblesImgBool) {
                console.log(`Found Marbles Pre-Race header, starting read @ ${this.StreamImage.imgs_downloaded}`)
                this.ServerStatus.enterReadState()
            } else {
                return
            }
        }

        // Determine the visible & predicted users on this frame
        // ==============================================================================
        const processImgId = this.StreamImage.imgs_processed++
        const frameObj = {
            log: '',
            frame_num: imgId,
            process_id: processImgId,
            offset: null,
        }
        const frameLog = (log, level) => { // TODO: Add level code
            console.log(log)
            frameObj.log += log
        }
        
        /** All on-screen users with their appearance checked */
        const screenUsersMap = await mng.getUNBoundingBox(null, {appear:true, length:false})
        /** @type {Map<number, VisualUsername>} All visible users this frame */
        const screenVisibleUsers = new Map(screenUsersMap.entries().filter(
            ([idx, user]) => user.appear
        ));
        
        // Update if no visible users are available
        if (screenVisibleUsers.size == 0) {
            this.ScreenState.frames_without_names += 1
            return
        } else
            this.ScreenState.frames_without_names = 0

        // Get prediction from usernameList
        let {predictedUsers, offset} = this.usernameTracker.predict(processImgId, 
            {totalUsers:null, predictFullScreen:true}, this.ScreenState.knownScreen)
        
        /** Num of users to use for length check against prediction */
        // const LEN_CHECK_MATCH = 6;
        /** Actual offset from on-screen analysis */
        // let offsetMatch = null;
        /** If true, do not update or check any lengths this frame and immediately quit */
        let skipFrameBadOffset = false;
        /** Allow offset greater than limits */
        let allowBigOffset = false;
        /** @type {import('./ServerClassModule.mjs').LenObject} Keep track of offset */
        const len_check_count = {
            offset_ql: 0,
            offset: 0,
            post_match: 0,
            pre_ocr: 0,
            color: 0,
            basic_col: 0
        }
        frameObj.len_obj = len_check_count
        
        // Reconcile offset by checking the prediction
        // =======================================================================

        // First, get the best length to check
        const lenScoreMap = UsernameAllTracker.getVIdxToCheckByLen(predictedUsers)
        let goodMatch = false; 
        /** Determine offset from length matching */
        let offsetMatch = 0;
        /** Keep track of length checks */
        const trackQLTest = []
        // loop lengths, trying to find at least 2 matches
        for (const [score, pidx] of lenScoreMap) {
            
            let testIdx = pidx
            qlloop: do {
                const offsetTestIdx = Math.max(0, testIdx - offsetMatch)
                const tvUser = screenVisibleUsers.get(offsetTestIdx)
                if (!tvUser || tvUser.validLength) continue // not visible or known len

                for (const lenOffset of iterateRN(-1, 1)) { // Iterate 1 pixel for length
                    const pTestLen = predictedUsers[pidx].length+lenOffset
                    await mng.getUNBoundingBox(new Map([[offsetTestIdx, tvUser]]), 
                        {appear:false, length:false,
                            quickLength:new Map([[offsetTestIdx, pTestLen]])})
                    len_check_count.offset_ql += 1

                    trackQLTest.push({ // debug logging
                        vidx:pidx, 
                        testIdx:offsetTestIdx, 
                        ql:tvUser.validLength, 
                        testql:pTestLen
                    })

                    if (tvUser.validLength) {
                        tvUser.debug.qlLen = true
                        break qlloop
                    }
                }
            } while ((--testIdx) - offsetMatch >= 0); // load-bearing ;

            // Determine best prediction from result
            ({offsetMatch, goodMatch} = UsernameAllTracker.findVisualOffset(
                predictedUsers, screenVisibleUsers
            ))
            frameObj.len_ofst = {goodMatch, offsetMatch}
            if (goodMatch) break
            
        }
        frameObj.ql_logs = trackQLTest

        // attempt color verification if goodMatch fails
        if (!goodMatch && lenScoreMap.length > 0) {
            // const colorScoreMap = UsernameAllTracker.getVIdxToCheckByColor(predictedUsers)
            // TODO: Better function for picking the range
            const color_sw = new Stopwatch()
            const LIMIT = 28;
            // for (const [score, pidx] of colorScoreMap) {
            colorLoop: for (const pidx of iterateRN(18, 8)) {
                let testIdx = pidx
                // do {
                    const tvUser = screenUsersMap.get(testIdx)
                    
                    await mng.getUNBoundingBox(new Map([[testIdx, tvUser]]),
                        {appear:false, length:false, color:true}
                    )
                    len_check_count.color += 1

                    if (len_check_count.color++ > LIMIT ) break colorLoop;
                    // if (tvUser.color && tvUser.color == predictedUsers[pidx].color) break;
                // } while ((--testIdx) - offsetMatch >= 0);
            }

            console.debug(`Color match took ${color_sw.htime}`); // load bearing 

            ({goodMatch, offsetMatch} = UsernameAllTracker.findColorOffset(
                predictedUsers, screenUsersMap
            ));
            frameObj.color_ofst = {goodMatch, offsetMatch}
            frameObj.color_logs = Array.from(screenUsersMap.entries()).map( ([idx, user]) => `${idx}=>${user.color}`)
        }

        if (lenScoreMap.length > 0 && !goodMatch) {   // set to fail-back offset
            // TODO: do discontinuity code
            if (screenVisibleUsers.size > 3) {
                const knownLenVUsers = Array.from(screenVisibleUsers.values()).filter( u => u.validLength)
                const lenString = `${knownLenVUsers.length}/${screenVisibleUsers.size}`

                if (knownLenVUsers.length > 0) {
                    if (offsetMatch != null) { // Found goodMatchNum-1, allow
                        console.warn(`No offset match ${lenString}; Only 1 match, allowing offset ${offsetMatch}`)
                    } else { // Found no match, skip (likely testing against unknown lengths)
                        console.warn(`No offset match ${lenString}; Inconsistent match, skipping`)
                        skipFrameBadOffset = true
                    }
                } else {
                    // console.warn("Discontinuity offset reconcil")
                    console.warn(`No offset match ${lenString}; Unreadable frame skipping`)
                    skipFrameBadOffset = true
                }
            } else if (offsetMatch == null) {
                offsetMatch = 0
                console.warn(`No offset match with ${screenVisibleUsers.size} available: set to ${offsetMatch}`)
            } else {
                console.warn(`Unclear offset status?`)
            }
        }

        if (!allowBigOffset && (offsetMatch > 6 || offsetMatch < -2)) {
            console.warn(`No op offset detected`, offsetMatch)
        } else if (offsetMatch != null && offsetMatch > 0) {
            this.usernameTracker.shiftOffset(offsetMatch, processImgId); // update offset
            // FYI this is a load-bearing semi-colon due to destructure object {o1, o2} below

            // Predicted users is inaccurate, recalc
            ({predictedUsers, offset} = this.usernameTracker.predict(processImgId, 
                {totalUsers:null, predictFullScreen:true}, this.ScreenState.knownScreen))
        }

        frameObj.offset = offsetMatch
        
        if (skipFrameBadOffset)
            return

        // After this line, the predictedUsers is verified
        // =======================================================================

        // mostly for debug to see track first appearance
        for (const [idx, pUser] of predictedUsers.entries()) {
            const vUserVisible = screenUsersMap.get(idx).appear
            if (!pUser.seen && vUserVisible) { // if screen is known, set seen & time
                pUser.seen = vUserVisible
                if (this.ScreenState.knownScreen)
                    pUser.enterFrameTime = processImgId
            }
        }

        this.ScreenState.addPredictedFrame(predictedUsers)

        // Now do as many length checks for visible names that do not have length checks first
        // =========================
        const LEN_LIMIT_PER_FRAME = 25; // NOTE: Maxing this for testing
        const lastVisibleIdx = Array.from(screenVisibleUsers.keys()).at(-1)
        for (const [vidx, vUser] of screenUsersMap.entries()) {

            if (vidx > lastVisibleIdx) continue; // if not on screen, dont do anything
            const pUser = predictedUsers[vidx]
            const ocrAvailable = vidx != 23 && !this.debug_obj.disable_ocr_len
            const shouldCheckLen = vUser.appear && vUser.lenUnchecked
            
            if (!pUser.length && shouldCheckLen) {
                await mng.getUNBoundingBox(new Map([[vidx, vUser]]), {appear:false, length:true})
                len_check_count.post_match++
                vUser.debug.unknownLen = true
            } else if (ocrAvailable && pUser.readyForOCR && shouldCheckLen) {
                // TODO: Use quick box if length already exists
                await mng.getUNBoundingBox(new Map([[vidx, vUser]]), {appear:false, length:true})
                len_check_count.pre_ocr++
                vUser.debug.ocrLen = true
            } else if (!pUser.hasImageAvailable && vidx != 23 && vidx >= lastVisibleIdx) {
                // Get ANY image to make sure I have something
                this.captureBasicImage(pUser, vidx, mng, processImgId)
                len_check_count.basic_col++
                // get a color sig if possible
                await mng.getUNBoundingBox(new Map([[vidx, vUser]]), {appear:false, length:false, color:true})
            } else {
                continue // skip length & ocr
            }

            pUser.setLen(vUser.length)
            pUser.setColor(vUser.color)
            if (pUser.length && ocrAvailable && pUser.readyForOCR) {
                pUser.ocr_processing = true;
                this.queueIndividualOCR(pUser, vidx, mng, processImgId)
            }
        }

        this.ScreenState.addVisibleFrame(Array.from(screenUsersMap.values()))
        this.ScreenState.frameObj.push(frameObj)
        
        // Some screen state tracking things
        const post_match_len_checks = len_check_count.post_match + len_check_count.pre_ocr
        if (this.debug_obj.screen_state_log && 
            (this.ScreenState.shouldDisplaySmth || post_match_len_checks > 0)) {
            console.log(
                `V: ${this.ScreenState.visibleScreenFrame.at(-1)} | Offset: ${offsetMatch}\n`+
                `P: ${this.ScreenState.predictedFrame.at(-1)} | ${JSON.stringify(len_check_count)}`
            )
        }

        if (!this.ScreenState.knownScreen)
            this.ScreenState.knownScreen = true // flip this when screen cannot be seen & top user is unknown

        this.ServerStatus.frame_end_time[imgId] = performance.now()
        if (this.debug_obj.frame_pacing) {
            console.log(`${this.ServerStatus.frameAvg(imgId)} Curr Frame:${this.ServerStatus.frameTiming(imgId).toFixed(2)}ms`)
        }
        // TODO: Put frame timing down here
        console.log(`-- End Frame_num ${imgId.toString().padStart(5, ' ')} -- Total Users: ${this.usernameTracker.count} `)

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
        const binPerf = new Stopwatch()
        let sharpBuffer = null;
        try {
            sharpBuffer = await mng.cropTrackedUserName(visibleIdx, user.length)
        } catch {
            console.warn("Failed to crop the image correctly")
            return
        }

        const binUserImg = await mng.binTrackedUserName([sharpBuffer], user)
        if (this.debug_obj.user_bin)
            console.log(`bin #${processImgId} @ ${visibleIdx} took ${binPerf.htime}`)

        const binSharp = SharpImg.FromRawBuffer(binUserImg).toSharp({toJPG:true, scaleForOCR:true})
        const binBuffer = await binSharp.toBuffer()

        await this.OCRManager.queueOCR(binBuffer, {jobId:`VI:${visibleIdx}-PI:${processImgId}`})
        .then( async ({data, info, jobId, time}) => {

            this.ServerStatus.addUserReconLagTime(time)
            if (data.lines.length == 0) {
                if (this.debug_obj.user_bin)
                    console.warn(`Got nothing for #${processImgId} @ ${user.index}`)
                return
            }
            for (const line of data.lines) {
                if (line.text.length < 4) continue; // Twitch limits
                const text = line.text.trim()
                const saveImg = await sharpBuffer.toSharp({toJPG:true}).toBuffer()
                user.addImage(saveImg, text, line.confidence);
                user.ocr_time = time
                this.usernameTracker.updateHash(text, user)
                // TODO: NOTE this will double if multiple lines get detected somehow
            }
            
            if (this.debug_obj.ocr_output)
                console.log(`Recognized name #${processImgId} @ ${user.index} as ${user.name} conf:${user.confidence.toFixed(1)}% in ${time.toFixed(0)}ms`)
        })
        .finally(
            _ => {
                user.ocr_processing = false; // finished processing OCR
            }
        )
        
    }

    /**
     * Crop individual image at -300 to ensure something is captured
     * @param {TrackedUsername} user 
     * @param {number} visibleIdx current index on this frame
     * @param {UserNameBinarization} mng binarization object
     * @param {number} processImgId img_processed image
     */
    async captureBasicImage (user, visibleIdx, mng, processImgId) {

        const sharpBuffer = await mng.cropTrackedUserName(visibleIdx, -300)
        const saveImg = await sharpBuffer.toSharp({toJPG:true}).toBuffer()
        user.addImage(saveImg, null, -1);
        if (this.debug_obj.ocr_output)
            console.log(`Add generic image for #${processImgId} @ ${user.index}`)
    }


    // --------------------------------------------------------------------
    // Router/Server functions
    // --------------------------------------------------------------------

    /**
     * Retrieve and store twitch token for channel info
     */
    async getTwitchToken() {

        if (this.twitch_monitor.access_token) return this.twitch_monitor.access_token

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
            this.twitch_monitor.access_token = res.data['access_token']
            
            // Set auth headers
            this.twitch_auth_headers = {
                "Authorization": `Bearer ${this.twitch_monitor.access_token}`,
                "Client-Id": `${TWITCH_ACCESS_TOKEN_BODY.client_id}`
            }
            
            console.log("Retrieved Twitch Access Token")
            return this.twitch_monitor.access_token
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

        if (!this.twitch_monitor.monitor_interval) {
            await this.getTwitchToken()

            let firstReq = true
            this.twitch_monitor.monitor_interval = setInterval( () => {
                axios.get(`${TWITCH_CHANNEL_INFO_URL}?broadcaster_id=${this.twitch_monitor.broadcaster_id}`,
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
                        this.twitch_monitor.last_game_name != new_game_name) {
                            // Start up the streamMonitor
                            console.log(`Switched Game to ${new_game_name}; clearing & starting streamMonitor`)
                            this.start(TWITCH_DEFAULT_BROADCASTER)
                        }

                    this.twitch_monitor.last_game_name = new_game_name
                }).catch( err => {
                    console.warn(`Failed to get Twitch-Monitor ${err}`)
                    if (err.response) {
                        if (err.response.status == 401) {
                            this.twitch_monitor.access_token = null
                            console.log("Refreshing Twitch Access Token")
                            this.getTwitchToken()
                        }
                    }
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
        return {"state": this.ServerStatus.state, "text": retText}
    }

    stop () {
        let resp_text = "Already Stopped"

        if (!this.ServerStatus.stopped) {
            this.spinDown()

            resp_text = "Stopped image parser"
            this.ServerStatus.enterStopState()
        }

        this.debug_obj.vod_dump = false;

        return {"state": this.ServerStatus.state, "text": resp_text}
    }

    /** 
     * Clear all state objects to get back to a neutral state
     * To be used when clearing all usernames & state for a brand-new reading
     */
    clear () {
        console.log("Clearing server state")
        this.StreamImage.reset()
        this.ServerStatus.clear()
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
        this.ServerStatus.allViewers.add(req.ip)
        
        while (this.ServerStatus.monitoredViewers.at(0) < curr_dt + 300)
            this.ServerStatus.monitoredViewers.shift()

        if (req.query?.admin != undefined) {
            // TODO: Use a different page + endpoint
        } else {
            // Track viewers
            this.ServerStatus.monitoredViewers.push(Date.now() + ServerStatus.DEFAULT_VIEWER_INTERVAL) // TODO: Link client to this value
        }

        return {
            'status': this.ServerStatus.toJSON(),
            'streaming': this.ServerStatus.streamingTime,
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
     * @param {number} skipTo Skip to this index when starting
     */
    async localTest (source, ocrType, vodDump=false, skipTo=null) {

        if (fsAll.statSync(source).isDirectory()) {
            
            const fileList = await fs.readdir(source);
            fileList.sort( (fileA, fileB) => {
                return parseInt(fileA.split('.')[0], 10) - parseInt(fileB.split('.')[0], 10)
            })

            if (fileList == null)
                throw new Error("Invalid folder, folder is empty/DNE")

            console.log(`Running test on ${source}`)
            this.ServerStatus.enterWaitState()
            const localTest_sw = new Stopwatch();
            // TODO: Change based on OCR type
            this.OCRManager.warmUp();

            const filePromiseList = []
            const waitTime = 1_000
            for (const fileName of fileList) {
                if (fileName.endsWith('txt')) {
                    continue // NOTE: Going to provide this separately probably
                }
                
                const fileIdx = parseInt(fileName.split('.')[0], 10)
                if (skipTo != null && fileIdx < skipTo) {
                    console.debug(`Skip filename ${fileName}`)
                    continue
                }

                const filepath = path.resolve(source, fileName)
                console.debug(`Parse filename ${fileName}`)
                filePromiseList.push(this.handleImage(filepath, fileIdx))

                if (this.ServerStatus.stopped) {
                    console.log("In stopped state, stopping parse")
                    break
                }
                // Wait FPS time
                await setTimeout(waitTime / MarblesAppServer.FFMPEG_FPS, `Sent ${fileName}`)
            }
            
            this.ServerStatus.enterStopState()
            console.log(`Test run took ${localTest_sw.htime}`)
        } else {
            // source is video
            // technically this should copy start() and use that flow
            // I have todo manual stuff instead here
            this.clear()
            this.ServerStatus.enterWaitState()
            this.debug_obj.vod_dump = vodDump
            this.startFFMPEGProcess(source)
            // everything runs on server
        }

        return {test: "Runnin test"}
    }

    async testAgainstList(text_list=null, source_file=null) {

        const listTest_sw = new Stopwatch();
        /** @type {string[]} list of users to test against */
        let user_list = null
        if (text_list) 
            user_list = text_list
        else if (source_file) {
            const source_content = await fs.readFile(source_file, { encoding: 'utf8'})
            user_list = source_content.split('\r\n') // windows line endings
        }

        console.debug(`Test against name list, len: ${user_list.length}`)

        // ======================================================

        const resultObj = {
            /** @type {Map<number, number>} Every score:number of scores */
            scoreMap: new Map(),
            /** All score count */
            scoreNum: 0,
            /** mean of all scores */
            scoreMean: 0,
            /** Mean of all scores that are not 0 by leven dist */
            nonPerfectMean: null,
            /** @type {Map<number, number>} Match ext_index:actual_index */
            indexMatchMap: new Map(),
            /** mean of all index differences */
            indexMean: 0,
            indexNum: 0,
            /** can determine this with sorting but unnecessary */
            median: null,
            /** names that are in the index but not OCR */
            unread_name: 0,
            /** @type {Map<number, number>} internal_idx:letter_dist of UserObj with VERY different aliases */
            failAliasIdxMap: new Map(),
            /** @type {string[]} list of users that were not found */
            notFound: []
        }

        const intUserList = this.usernameTracker.usersInOrder; 
        const visitCache = new Set()
        const list_pts = []
        list_pts.push([0,0, []])

        while(list_pts.length > 0) {
            const [ext_list_pt, int_list_pt, stackArr] = list_pts.shift();
            if (ext_list_pt >= user_list.length || int_list_pt >= intUserList.length) break

            const uq_str = `${ext_list_pt},${int_list_pt}${JSON.stringify(stackArr)}`
            if (!visitCache.has(uq_str)) {
                visitCache.add(uq_str)
            } else {
                continue;
            }

            const ext_user_name = user_list[ext_list_pt]
            const int_user_obj = intUserList[int_list_pt]

            if (int_user_obj.name == null) {
                const indexDiff = ext_list_pt - int_list_pt
                const nStackArr = stackArr.slice()
                const nStackObj = {indexDiff, ext_list_pt, nullSkip:1, levenDist:100}
                nStackArr.push(nStackObj)
                list_pts.push([ext_list_pt+1, int_list_pt+1, nStackArr])

                // visit skipping the null completely, no penalty
                const skipNullStackArr = stackArr.slice()
                skipNullStackArr.push({nullSkip:1})
                list_pts.push([ext_list_pt, int_list_pt+1, skipNullStackArr])
                continue;
            }

            const aliasScores = []
            for (const userAlias of int_user_obj.aliases) {
                if (userAlias == null) continue;
                const dist = UsernameSearcher.calcLevenDistance(ext_user_name, userAlias)
                aliasScores.push(dist)
            }
            aliasScores.sort((a,b) => a-b)

            // Compare aliases to ensure that different names are not under the same userObj
            if (int_user_obj.aliases.size > 1 
                && resultObj.failAliasIdxMap.get(int_list_pt) == null) {
                for (const i of iterateN(int_user_obj.aliases.size-1)) {
                    for (const j of iterateN(int_user_obj.aliases.size, i+1)) {
                        // since its usually 2-3 names, just calc lt comparison
                        const ltMap = new Map();
                        const aliasList = Array.from(int_user_obj.aliases.values()) 
                        for (const lt of aliasList[i])
                            ltMap.set(lt, (ltMap.get(lt) ?? 0) + 1)
                        for (const lt of aliasList[j])
                            ltMap.set(lt, (ltMap.get(lt) ?? 0) - 1)
                        
                        const ltDist = Array.from(ltMap.values()).reduce((a,b) => a+b)
                        // if levenDist is higher than 3, flag this
                        if (ltDist > 3)
                            resultObj.failAliasIdxMap.set(int_list_pt, ltDist)
                    }
                }
            }

            if (aliasScores.at(0) <= UsernameSearcher.SCORING.UNKNOWN) { // found match
                // collapse the stack to reduce memory
                for (const stackObj of stackArr) {
                    if (stackObj == null) continue;
                    resultObj.unread_name += stackObj.nullSkip ?? 0
                    if (stackObj.ext_list_pt) {
                        resultObj.indexMatchMap.set(stackObj.ext_list_pt, stackObj.indexDiff)
                        resultObj.indexMean += stackObj.indexDiff
                    } else if (stackObj.notFound) {
                        resultObj.notFound.push(stackObj.notFound)
                    }
                }
                list_pts.length = 0; // clear this list

                // index score update
                const indexDiff = Math.abs(ext_list_pt - int_list_pt)
                resultObj.indexMatchMap.set(ext_list_pt, indexDiff)
                resultObj.indexMean += indexDiff
                resultObj.indexNum += 1
                // score update
                const score = aliasScores.at(0)
                resultObj.scoreMap.set(score, (resultObj.scoreMap.get(score) ?? 0) + 1)
                resultObj.scoreNum += 1
                resultObj.scoreMean += score
                // move pointers, match found
                list_pts.push([ext_list_pt+1, int_list_pt+1, []])
            } else {
                // IMO should split both paths until 1 reaches the next match by breadth first
                const skipNameArr = stackArr.slice()
                skipNameArr.push({notFound:[ext_list_pt, ext_user_name]})
                list_pts.push([ext_list_pt+1, int_list_pt, skipNameArr])
                list_pts.push([ext_list_pt, int_list_pt+1, stackArr.slice()])
            }
        }

        console.debug("Completed matching")

        resultObj.indexMean /= resultObj.indexNum
        resultObj.scoreMean /= resultObj.scoreNum
        // Ignoring median, kind of not important over about 10-20 counts

        const nonPerfectCount = Array.from(resultObj.scoreMap.keys()).length
        resultObj.nonPerfectMean = Array.from(resultObj.scoreMap.entries())
            .reduce((cv, [scoreVal, scoreNum]) => scoreVal*scoreNum + cv, 0) / nonPerfectCount

        // sort index offsets in a well formatted manner
        const collIdxArr = []
        for (const [indexID, indexOff] of resultObj.indexMatchMap.entries()) {
            let arr = collIdxArr.at(-1)
            if (arr && arr[0] == indexOff) {
                // do nothing
            } else {
                arr = [indexOff, Infinity, -Infinity]
                collIdxArr.push(arr)
            }
            arr[1] = Math.min(arr[1], indexID)
            arr[2] = Math.max(arr[2], indexID)
        }

        const stats = [
            `Score Map: ${formatMap(resultObj.scoreMap, ':')};\tScore Mean: ${resultObj.scoreMean.toFixed(2)}`,
            `Index Map: ${collIdxArr.map( arr => `${arr[1]}->${arr[2]}:${arr[0]}`).join('\n')};\tIndex Mean: ${resultObj.indexMean.toFixed(2)}`,
            `Median: ${resultObj.median}, Avg-non-perfect ${(resultObj.nonPerfectMean).toFixed(2)}`,
            `Not found list (${resultObj.notFound.length}): ${resultObj.notFound.join(', ')}`,
            `Fail Alias List: ${formatMap(resultObj.failAliasIdxMap)}`,
            `Completed test in ${listTest_sw.htime}`]

        console.debug(stats.join('\n'))
        
    }
}