import { Statistic, Stopwatch, iterateN } from "./UtilityModule.mjs"
import { VisualUsername } from "./UserModule.mjs"
import * as Mathy from './Mathy.mjs'

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

const SERVER_STATE_DESC = {
    [SERVER_STATE_ENUM.STOPPED]: "Marbles has not started and server is disabled.",
    [SERVER_STATE_ENUM.WAITING]: "Marbles has started, waiting for the Pre-Race screen",
    [SERVER_STATE_ENUM.READING]: "Marbles has started, reading on-screen names.",
    [SERVER_STATE_ENUM.COMPLETE]: "Server has read all available names and has stopped."
}

/** Contains all the image format info for this program */
export class ImageFormatConstants {
    /** JPG start of image */
    static JPG_SOI = Uint8Array.from([0xFF, 0xD8])
    /** JPG end of image */
    static JPG_END_OF_FILE = Uint8Array.from([0xFF, 0xD9]) // End of file
    static JPG_FILE_FORMAT = 'jpg'

    /** PNG start of image */
    static PNG_MAGIC_NUMBER = Uint8Array.from([0x89, 0x50, 0x4E, 0x47])
    /** PNG end of image */
    static PNG_IEND = Uint8Array.from([0x49, 0x45, 0x4E, 0x44])

    static PNG_CHUNK_SIZE = 4
    static PNG_CRC_SIZE = 4
    static PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    
    static PNG_FULL_IEND_CHUNK = Uint8Array.from(
        [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82])
    
    static PNG_AFTER_IEND_OFFSET = 8
    static PNG_FILE_FORMAT = 'png'

}

/**
 * @typedef {[string, string[], Buffer]} ImageFormat
 * @type {[]}
 */

/**
 * 
 */
export class StreamingImageBuffer {

    /** @type {ImageFormat} JPG list of constants */
    static JPG_FORMAT = [
        ImageFormatConstants.JPG_FILE_FORMAT,
        ["mjpeg", "-qscale:v", "1", "-qmin", "1", "-qmax", "1"],
        ImageFormatConstants.JPG_END_OF_FILE,
    ]

    /** @type {ImageFormat} PNG list of constants */
    static PNG_FORMAT = [
        ImageFormatConstants.PNG_FILE_FORMAT,
        ['png'], // '-pix_fmt', 'rgba'],
        ImageFormatConstants.PNG_IEND,
        // ImageFormatConstants.PNG_FULL_IEND_CHUNK,
        // ImageFormatConstants.PNG_AFTER_IEND_OFFSET
    ]

    /**
     * @param {string} file_format 
     * @param {string[]} ffmpeg_cmd 
     * @param {Uint8Array} start_buffer
     * @param {Uint8Array} end_buffer 
     * @param {number} chunkSize
     */
    constructor(file_format, ffmpeg_cmd, end_buffer) {
        /** @type {string} file_format to save on disk */
        this.file_format = file_format
        /** @type {string[]} format & etc for ffmpeg codec */
        this.ffmpeg_cmd = ffmpeg_cmd
        /** @type {Uint8Array} the magic number to indicate end of image file */
        this.end_buffer = end_buffer

        // this.chunk_size = chunkSize

        /** @type {Buffer[]} progressive buffer of the image */
        this.prgBufferArr = []

        /** progressive chunk details */
        this.pngChunk = {
            /** add N bytes from previous buffer */
            addPrev: 0,
            /** len+crc of the chunk */
            len_n_crc: 0,
            /** @type {string} chunk type as string */
            type: null,
            /** @type {Buffer} chunk type as buffer */
            typeBuffer: null,
            /** has png_header been identified */
            found_png_header: false,
        }

        /** JPG progressive chunk state */
        this.jpgChunk = {
            jpeg_header: false,
            type: null,
            typeBuffer: null,
            len: 0,
            within_SOS: false
        }

    }

    static updatePNGFormat(ffmpeg_cmd) {
        StreamingImageBuffer.PNG_FORMAT.ffmpeg_cmd = ffmpeg_cmd
    }

    static updateJPGFormat(ffmpeg_cmd) {
        StreamingImageBuffer.JPG_FORMAT.ffmpeg_cmd = ffmpeg_cmd
    }


    /**
     * Iterate through PNG file chunks (state saved in object)
     * This assumes there is only 1 EOF in this buffer, otherwise why are you using a stream 
     * TODO: For multiple cuts, just return array and handle cuts in top array
     * @param {Buffer} buffer
     * @returns {number} index indicating end of PNG
     */
    iteratePNGChunks(buffer) {
        /** iteration index */
        let iterIdx = 0
        /** remove N from cut indexes since a join with previous index was performed */
        let prevBuffIdxOffset = 0
        /** @type {number[]} byte index to cut for end of PNG */
        let retCutIdx = -1

        // If prev buffer was not parsed to completion, add to this buffer
        if (this.pngChunk.addPrev) {
            const prevBuffer = this.prgBufferArr.at(-1)
            prevBuffIdxOffset = -this.pngChunk.addPrev
            buffer = Buffer.concat(
                [prevBuffer.subarray(this.pngChunk.addPrev), buffer])
            this.pngChunk.addPrev = 0
        }

        // Cannot read chunk/length if < 8 bytes, then concat the prev one
        // TODO: Handle no prev buffer with addPrev across multiple
        if (buffer.length < ImageFormatConstants.PNG_CHUNK_SIZE*2) {
            const bytesNeeded = ImageFormatConstants.PNG_CHUNK_SIZE*2 - buffer.length
            buffer = Buffer.concat([this.prgBufferArr.at(-1).subarray(-bytesNeeded), buffer])
            prevBuffIdxOffset -= bytesNeeded
        }

        
        while (iterIdx < buffer.length) { // iterate to end of buffer

            if (this.pngChunk.len_n_crc > 0) { // iterate to chunk_length
                const iterMov = Math.min(this.pngChunk.len_n_crc, buffer.length-iterIdx)
                iterIdx += iterMov
                this.pngChunk.len_n_crc -= iterMov
                
                if (this.pngChunk.len_n_crc == 0) { // at end of chunk
                    if (this.pngChunk.typeBuffer.equals(ImageFormatConstants.PNG_IEND)) {
                        this.pngChunk.found_png_header = false
                        retCutIdx = iterIdx + prevBuffIdxOffset
                    }
                    this.pngChunk.type = null
                    this.pngChunk.typeBuffer = null
                }
            }

            // defer if not enough bytes to read header remaining
            if (iterIdx + ImageFormatConstants.PNG_CHUNK_SIZE*2 >= buffer.length) {
                this.pngChunk.addPrev = buffer.length - iterIdx
                break
            }

            // find PNG header first
            if (!this.pngChunk.found_png_header) {
                const png_header = buffer.subarray(iterIdx,
                    iterIdx + ImageFormatConstants.PNG_CHUNK_SIZE*2
                )

                if (png_header.equals(ImageFormatConstants.PNG_HEADER)) {
                    this.pngChunk.found_png_header = true
                    iterIdx += ImageFormatConstants.PNG_HEADER.length
                } else 
                    throw Error("Header was not found!!!")
            }
            else { // read chunk details

                const chunk_len = buffer.readUInt32BE(iterIdx)
                const chunk_type = buffer.subarray(
                    iterIdx + ImageFormatConstants.PNG_CHUNK_SIZE,
                    iterIdx + ImageFormatConstants.PNG_CHUNK_SIZE*2
                )
                iterIdx += ImageFormatConstants.PNG_CHUNK_SIZE*2

                this.pngChunk.len_n_crc = chunk_len + ImageFormatConstants.PNG_CRC_SIZE
                this.pngChunk.type = chunk_type.toString() // Disable after testing
                this.pngChunk.typeBuffer = chunk_type
                
                // console.log(`chunk type ${this.chunkDetails.type}, length_crc ${this.chunkDetails.len_n_crc}`)
            }
        }

        return retCutIdx
    }

    /** 
     * Split the input buffer by EOF depending on format
     * This also assumes only 1 EOF per buffer
     * @param {Buffer} buffer buffer stream
     * @returns {[Buffer | null, Buffer | null]} list of split buffers
     */
    splitBufferByEOF(buffer) {
        let cutIdx = -1
        if (this.file_format == ImageFormatConstants.PNG_FILE_FORMAT)
            cutIdx = this.iteratePNGChunks(buffer)
        else { // JPG Format
            cutIdx = buffer.indexOf(this.end_buffer)
            cutIdx += cutIdx == -1 ? 0 : ImageFormatConstants.JPG_END_OF_FILE.length
        }

        
        if (cutIdx != -1) {
            const rmBuffer = cutIdx < buffer.length 
                ? buffer.subarray(cutIdx) 
                : null
            return [buffer.subarray(0, cutIdx), rmBuffer] 
        }

        return [null, buffer]

    }

    /**
     * Internally manage a progressive buffer
     * @param {Buffer} buffer 
     * @returns {Buffer | null} buffer if a new one
     */
    progressiveBuffer(buffer) {
        const [newBuffer, remainBuffer] = this.splitBufferByEOF(buffer)
        let retBuffer = null

        if (newBuffer) {
            retBuffer = Buffer.concat([...this.prgBufferArr, newBuffer])
            this.prgBufferArr = []
        } 
        
        if (remainBuffer) {
            this.prgBufferArr.push(remainBuffer)
        }

        return retBuffer
    }
}

/**
 * Keeps track of downloaded images
 * Also tracks the time to know when the image 
 */
export class StreamImageTracking {

    /**
     * @param {Array[]} img_format 
     */
    constructor(img_format) {

        this.img_format = img_format

        /** @type {number} current image being processed*/
        this.imgs_processed = 0

        /** @type {StreamingImageBuffer} */
        this.streamingBuffer = new StreamingImageBuffer(...img_format)

        /** @type {number} images downloaded from stream */
        this.imgs_downloaded = 0
        // /** @deprecated @type {number} images read by OCR */
        // this.imgs_read = 0

        /** @type {number} Lag time is recognize a user image */
        this.lag_time = 0

        /** @type {Stopwatch} time when 1st image was retrieved */
        this.start_sw = null

        
        /** @type {Statistic} keep track of frame fps */
        this.frame_stat = new Statistic()
        /** @type {Date} time of last buffer */
        this.lastBufferDL_ts = null
    }

    /** Reset all objects to default  */
    reset() {
        // this.emptyImages = 0
        this.imgs_processed = 0
        // this.imageProcessQueueLoc = 0
        // this.imageProcessQueue = []
        this.streamingBuffer = new StreamingImageBuffer(...this.img_format)

        this.imgs_downloaded = 0
        this.imgs_read = 0

        this.start_sw = null

        this.lastBufferDL_ts = null
        this.frame_stat.clear()
    }

    /**
     * Add buffer to streaming image and increment variables
     * @param {Buffer} buffer 
     */
    addToBuffer (buffer) {
        const newFrameBuffer = this.streamingBuffer.progressiveBuffer(buffer)
        if (newFrameBuffer) {
            this.imgs_downloaded += 1
            
            if (this.imgs_downloaded == 1) {
                this.start_sw = new Stopwatch()
                this.lastBufferDL_ts = this.start_sw.start_ts
            } else if (this.lastBufferDL_ts) {
                const currTs = performance.now()
                this.frame_stat.add(currTs)
            }
        }
        return newFrameBuffer
    }

    /**
     * Return the imgs_downloaded/ms
     */
    get fps() {
        const timeToStart = this.start_sw.read();
        return (this.imgs_downloaded-1) / timeToStart * 1000
    }
}

export class ServerStatus {

    static DEFAULT_VIEWER_INTERVAL = 1_000 * 0.2;
    static POST_VIEWER_INTERVAL = 1_000 * 2;
    // static DEFAULT_VIEWER_INTERVAL = 1_000 * 0.2;
    static LAG_TIME_MAX = 20;

    constructor () {
        /** @type {string} current server state */
        this.state = SERVER_STATE_ENUM.STOPPED

        /** @type {Date} game start/open time */
        this.started_game_ts = null 
        /** @type {Date} name start read time */
        this.started_read_ts = null
        /** @type {Date} name end read time */
        this.ended_read_ts = null
        /** @type {Date} race start time */
        this.started_race_ts = null

        /** @type {number[]} how long on average to identify a user from first appearance */
        this.lagTimeArray = []
        /** @type {Statistic} keep track of averages  */
        this.lagTimeStat = new Statistic()

        /** @type {Date[]} [dt, ip] track viewer status by status */
        this.monitoredViewers = []
        /** @type {Map<string, number>} current viewers & number of logs */
        this.viewerMap = new Map()
        /** @type {Set<string>} list of all viewer ips */
        this.allViewers = new Set()

        /** @type {DOMHighResTimeStamp[]} tracking frame download time */
        this.frame_dl_time = []
        /** @type {DOMHighResTimeStamp[]} tracking for frame process time */
        this.frame_st_time = []
        /** @type {DOMHighResTimeStamp[]} tracking frame finish parsing time */
        this.frame_end_time = []

        /** @type {string} if true, queue a user list source check */
        this.localListSource = null;
    }

    /**
     * log viewer as active
     * @param {String} viewer_ip 
     * @param {Date} remove_dt 
     */
    logViewer (viewer_ip, remove_dt) {
        this.trimViewerCount(Date.now())
        // add num of logs to this viewerMap
        const val = this.viewerMap.get(viewer_ip) ?? 0
        this.viewerMap.set(viewer_ip, val+1)
        // add to viewer status link
        this.monitoredViewers.push([remove_dt, viewer_ip])
        // add to every visitor
        this.allViewers.add(viewer_ip)
    }

    /**
     * Trim the current viewer list
     * @param {Date} curr_dt 
     */
    trimViewerCount (curr_dt) {
        while (this.monitoredViewers.at(0)?.at(0) < curr_dt) {
            const [_del_dt, del_ip] = this.monitoredViewers.shift()
            const val = this.viewerMap.get(del_ip)
            if (val <= 1)
                this.viewerMap.delete(del_ip)
            else
                this.viewerMap.set(del_ip, val-1)
        }
    }

    /** Clear all tracked values */
    clear () {
        this.started_read_ts = null
        this.ended_read_ts = null
        this.started_race_ts = null

        this.monitoredViewers = []
        this.viewerMap.clear()
        this.allViewers.clear()

        this.lagTimeStat.clear()
        this.lagTimeArray = []
        this.frame_dl_time = []
        this.frame_st_time = []
        this.frame_end_time = []
    }

    enterWaitState () {
        this.started_game_ts = Date.now()
        this.state = SERVER_STATE_ENUM.WAITING
    }

    enterCompleteState () {
        this.ended_read_ts = Date.now()
        this.state = SERVER_STATE_ENUM.COMPLETE
    }

    enterReadState () {
        this.started_read_ts = Date.now()
        this.state = SERVER_STATE_ENUM.READING
    }

    enterStopState () {
        // this.ended_read_ts = 
        this.state = SERVER_STATE_ENUM.STOPPED
    }

    get wait () {
        return this.state == SERVER_STATE_ENUM.WAITING
    }

    get complete () {
        return this.state == SERVER_STATE_ENUM.COMPLETE
    }

    get stopped () {
        return this.state == SERVER_STATE_ENUM.STOPPED
    }

    /** Server is not running now */
    get notRunning () {
        return this.complete || this.stopped
    }

    get notReading () {
        return this.complete || this.wait || this.stopped
    }

    get currentViewers () {
        // return this.monitoredViewers.length
        return this.viewerMap.size
    }

    /**
     * Apparent FPS based on download frequency
     * @returns {number}
     */
    downloadFPS () {
        // determine average difference between all 
        const dl_avg_arr = this.frame_dl_time.slice(-20)
        const stat = new Statistic()
        for (const [idx, el] of dl_avg_arr.entries()) {
            if (idx == 0) continue
            stat.add(el-dl_avg_arr[idx-1])
        }
        return (1000/stat.mean)
    }

    /** Calc the lagging time based on apparent FPS 
     * @returns {number} ms behind live
    */
    lagToLive (fps = 30) {
        if (this.frame_dl_time.length < 2) return 0
        const ts_diff = this.frame_dl_time.at(-1) - this.frame_dl_time[1] // NOTE: downloaded img idx starts at 1
        const expectedTime = 1000 / fps * (this.frame_dl_time.length - 1)
        return ts_diff - expectedTime
    }

    /**
     * Time taken to process frame from download
     */
    frameDLtoProcess (frame_idx) {
        return this.frame_end_time.at(frame_idx) - this.frame_dl_time.at(frame_idx);
    }

    /** Time taken to process the frame */
    frameTiming (frame_idx) {
        // TODO: Make sure lengths match before doing -1
        const frameTime = this.frame_end_time.at(frame_idx) - this.frame_st_time.at(frame_idx);
        return frameTime
    }

    /**
     * Get frameAverage over N frames
     * @returns {Object} avg & std deviation
     */
    frameAvg (frameIdx) {
        const sampleFrames = []
        for (const idx of iterateN(-10, 0)) {
            sampleFrames.push(this.frameTiming(idx + frameIdx))
        }
        const filterSampleFrames = sampleFrames.filter(val => !isNaN(val))

        const stat = new Statistic(true, filterSampleFrames)
        const avg = stat.mean
        const stdDev = stat.stdDev

        const dl_avg = Statistic.CalcMean(
            Array.from(iterateN(-5, 0)).map(idx => this.frameDLtoProcess(idx + frameIdx)
                ).filter(val => !isNaN(val))
        )

        return `Process Avg:${avg.toFixed(2)}ms, SD:${stdDev.toFixed(2)}ms; E2E avg:${dl_avg.toFixed(2)}ms`
    }

    /**
     * Get amount of streaming time
     */
    get streamingTime () {
        if (this.started_race_ts) {
            if (this.ended_read_ts)
                return Stopwatch.msToHUnits(Date.now() - this.started_race_ts)
            else
                return Stopwatch.msToHUnits(this.ended_read_ts - this.started_race_ts)
        } else {
            return 'X'
        }
    }

    addUserReconLagTime (time) {
        this.lagTimeArray.push(time)
        this.lagTimeStat.add(time)

        while (this.lagTimeArray.length > ServerStatus.LAG_TIME_MAX) {
            this.lagTimeArray.shift()
        }
    }

    status () {
        return {
            'viewers': this.currentViewers,
            'unique_viewers': this.allViewers.size,
            'streaming_time': this.streamingTime,
            'marbles_game_ts': this.started_game_ts,
            'marbles_start_ts': this.started_read_ts,
            'marbles_end_ts': this.ended_read_ts,
            'state': this.state,
            'state_desc': SERVER_STATE_DESC[this.state],
            // also change this based on type of server and server state
            'interval': this.notRunning
                ? ServerStatus.POST_VIEWER_INTERVAL
                : ServerStatus.DEFAULT_VIEWER_INTERVAL // TODO: Change based on number of viewers that can be handled
        }
    }
    
}

/**
 * @typedef LenObject Object keeping track of length & bin checks
 * @property {number} offset_ql quicklength checks
 * @prop {number} offset offset checks
 * @prop {number} post_match checks done after offset to determine length
 * @prop {number} pre_ocr checks done before ocr but length is known
 * @prop {number} color checks done for color match
 * 
 */

/**
 * @typedef FrameObject
 * @property {string} log all non frame logging
 * @property {number} frame_num frames read from the system
 * @property {number} process_id frame id that have been processed
 * @property {number} offset offset determined during iteration
 * @property {LenObject} len_obj len object for this frame
 * @property {Object} [len_ofst] offset determined by length checks
 * @property {Object} [color_ofst] offset determined by color match 
 */

/**
 * Contains values/states concerning the visibility of the screen & names.
 * Note that if the screen was skipped, there will be no output here
 */
export class ScreenState {
    constructor () {
        /** @type {boolean} bool if previous screen was visible, trust timing for this screen */
        this.knownScreen = false

        this.chat_overlap = null
        this.barb_overlap = null
        this.unknown_overlap = null

        this.frames_without_names = 0

        /** @type {string[]} screen status for this frame */
        this.visibleScreenFrame = []
        // to track - 1. appear, 2. length checked this frame 3. used for offset match

        /** @type {string[]} predicted status for users this frame */
        this.predictedFrame = []
        // to track - 1. seen 2. had length 3. had OCR

        // /** @type {number[]} verified offset per frame */
        // this.offsetMatchFrame = []

        /** @type {FrameObject[]} keep track of all objects relevant for this frame */
        this.frameObj = []

        this.ignoredFrames = []
    }

    clear () {
        this.frames_without_names = 0

        this.knownScreen = false

        this.visibleScreenFrame = []
        this.predictedFrame = []
        this.frameObj = []
        this.ignoredFrames = []
    }

    /**
     * add logs for predicted Users this frame
     * @param {TrackedUsername[]} predictedUsers 
     */
    addPredictedFrame(predictedUsers) {
        this.predictedFrame.push(
            predictedUsers.map(pUser => ScreenState.predictedStr(pUser)).join('')
        )
    }

    /**
     * Add logs for visible on-screen users this frame
     * @param {VisualUsername[]} visibleUsers 
     */
    addVisibleFrame(visibleUsers) {
        this.visibleScreenFrame.push(
            visibleUsers.map(vUser => ScreenState.visibleStr(vUser)).join('')
        )
    }

    /**
     * @param {VisualUsername} vUser
     */
    static visibleStr(vUser) {
        
        if (vUser.appear && vUser.lenUnavailable)
            return 'D'
        if (vUser.appear && vUser.debug.qlLen)
            return 'Q'
        if (vUser.appear && vUser.debug.unknownLen)
            return 'U'
        if (vUser.appear && vUser.debug.matchLen)
            return 'K'
        if (vUser.appear && vUser.debug.ocrLen)
            return 'G'
        
        if (vUser.appear)
            return 'A'
        if (vUser.length && !vUser.appear)
            return '_' // should never show, appear is a pre-check
         
            return '?'
    }

    /**
     * @param {TrackedUsername} pUser 
     */
    static predictedStr(pUser) {
        if (pUser.name)
            return 'N'
        if (pUser.ocr_processing)
            return 'O'
        if (pUser.seen && pUser.length)
            return 'L'
        else if (pUser.seen)
            return 'S'
        else 
            return '*'
    }

    /**
     * Determine if I want to show the frame in debugging 
     * Rules
     * @returns {boolean}
     */
    get shouldDisplaySmth() {
        /*
            Whenever the visible state is different from prev (screen changed)
            Whever offset changed
            Whenever predictedUsers
                was seen, or gets a new length
            Whenever there was a new length check added to predictedUsers
            Whenever predictedUsers
        */
        if (this.visibleScreenFrame.length == 1) return true;
        if (this.visibleScreenFrame.length > 2 && 
            this.visibleScreenFrame.at(-1) != this.visibleScreenFrame.at(-2)
        ) return true;
        
        if (this.frameObj.at(-1).offset != 0) return true
        if (this.predictedFrame.at(-1) != this.predictedFrame.at(-2))
            return true;

        return false
    }
}