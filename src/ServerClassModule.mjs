import { SERVER_STATE_ENUM } from "./MarblesAppServer.mjs"

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
    static PNG_IEND_CHUNK = Uint8Array.from([0x49, 0x45, 0x4E, 0x44])

    static PNG_CHUNK_SIZE = 4
    static PNG_CRC_SIZE = 4
    static PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    
    static PNG_FULL_IEND_CHUNK = Uint8Array.from(
        [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82])
    
    static PNG_AFTER_IEND_OFFSET = 8
    static PNG_FILE_FORMAT = 'png'

}

export class ServerImageFormat {

    static JPG_FORMAT = new ServerImageFormat(
        ImageFormatConstants.JPG_FILE_FORMAT,
        ["mjpeg", "-qscale:v", "1", "-qmin", "1", "-qmax", "1"],
        ImageFormatConstants.JPG_END_OF_FILE,
    )

    static PNG_FORMAT = new ServerImageFormat(
        ImageFormatConstants.PNG_FILE_FORMAT,
        ['png'], // '-pix_fmt', 'rgba'],
        ImageFormatConstants.PNG_IEND_CHUNK,
        // ImageFormatConstants.PNG_FULL_IEND_CHUNK,
        // ImageFormatConstants.PNG_AFTER_IEND_OFFSET
    )

    /**
     * @param {string} file_format 
     * @param {string[]} ffmpeg_cmd 
     * @param {Uint8Array} start_buffer
     * @param {Uint8Array} end_buffer 
     * @param {number} chunkSize
     */
    constructor(file_format, ffmpeg_cmd, end_buffer, chunkSize=null, start_buffer=null) {
        /** @type {string} file_format to save on disk */
        this.file_format = file_format
        /** @type {string[]} format & etc for ffmpeg codec */
        this.ffmpeg_cmd = ffmpeg_cmd
        /** @type {Uint8Array} the magic number to indicate end of image file */
        this.end_buffer = end_buffer

        this.chunk_size = chunkSize

        /** @type {Buffer[]} progressive buffer of the image */
        this.prgBufferArr = []

        /** progressive chunk details */
        this.chunkDetails = {
            /** add N bytes from previous buffer */
            addPrev: 0,
            /** len+crc of the chunk */
            len_n_crc: 0,
            /** chunk type */
            type: null,
            /** has png_header been identified */
            png_header: false,
        }

    }

    static updatePNGFormat(ffmpeg_cmd) {
        ServerImageFormat.PNG_FORMAT.ffmpeg_cmd = ffmpeg_cmd
    }

    static updateJPGFormat(ffmpeg_cmd) {
        ServerImageFormat.JPG_FORMAT.ffmpeg_cmd = ffmpeg_cmd
    }


    /**
     * Iterate through PNG file structure
     * This assumes there is only 1 EOF in this buffer, otherwise why are you using a stream 
     * @param {Buffer} buffer
     * @returns {number[]} end of PNG
     */
    iteratePNGChunks(buffer) {
        /** iteration index */
        let iterIdx = 0
        /** remove N from cut indexes since a join with previous index was performed */
        let negaIdxOffset = 0
        /** @type {number[]} byte index to cut for end of PNG */
        let retCutIdx = -1

        // If prev buffer was not parsed to completion, add to this buffer
        if (this.chunkDetails.addPrev) {
            const prevBuffer = this.prgBufferArr.at(-1)
            negaIdxOffset = this.chunkDetails.addPrev
            buffer = Buffer.concat(
                [prevBuffer.subarray(-this.chunkDetails.addPrev), buffer])
            this.chunkDetails.addPrev = 0
        }

        // Cannot read chunk/length if < 8 bytes, then concat the prev one
        if (buffer.length < ImageFormatConstants.PNG_CHUNK_SIZE*2) {
            const diff = ImageFormatConstants.PNG_CHUNK_SIZE*2 - buffer.length
            buffer = Buffer.concat([this.prgBufferArr.at(-1).subarray(-diff), buffer])
            negaIdxOffset -= diff
        }

        // Buffer must be greater than 8 bytes
        while (iterIdx < buffer.length) {
            if (this.chunkDetails.len_n_crc > 0) {// iterate by chunk length
                const iterMov = Math.min(this.chunkDetails.len_n_crc, buffer.length-iterIdx)
                iterIdx += iterMov
                this.chunkDetails.len_n_crc -= iterMov
            } 

            // defer if not enough bytes to read header remaining
            if (iterIdx + ImageFormatConstants.PNG_CHUNK_SIZE*2 >= buffer.length) {
                this.chunkDetails.addPrev = buffer.length - iterIdx
                break
            }

            // find PNG header first
            if (this.chunkDetails.png_header == false) {
                const png_header = buffer.subarray(iterIdx,
                    iterIdx + ImageFormatConstants.PNG_CHUNK_SIZE*2
                )
                if (!png_header.equals(ImageFormatConstants.PNG_HEADER))
                    throw Error("Header was not found!!")
                else {
                    this.chunkDetails.png_header = true
                    iterIdx += ImageFormatConstants.PNG_HEADER.length
                }
            }
            else { // read chunk details
                const chunk_len = buffer.readUInt32BE(iterIdx)
                const chunk_type = buffer.subarray(
                    iterIdx + ImageFormatConstants.PNG_CHUNK_SIZE,
                    iterIdx + ImageFormatConstants.PNG_CHUNK_SIZE*2
                )
                iterIdx += ImageFormatConstants.PNG_CHUNK_SIZE*2

                // check for end of file
                if (chunk_type.equals(ImageFormatConstants.PNG_IEND_CHUNK)) {
                    this.chunkDetails.png_header = false
                    this.chunkDetails.len_n_crc = 0
                    this.chunkDetails.type = null
                    // NOTE: Assuming chunk_len is always 0, therefore chunk is 8 bytes
                    // TODO: If this errors, add another defer
                    retCutIdx = iterIdx - negaIdxOffset 
                        + chunk_len + ImageFormatConstants.PNG_CRC_SIZE
                    iterIdx += chunk_len + ImageFormatConstants.PNG_CRC_SIZE
                    if (chunk_len > 0)
                        throw Error(`chunk_len ${chunk_len} is not 0`)
                } else {
                    this.chunkDetails.len_n_crc = chunk_len + ImageFormatConstants.PNG_CRC_SIZE
                    this.chunkDetails.type = chunk_type.toString()
                }
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
        else // JPG Format
            cutIdx = buffer.indexOf(this.end_buffer) // TODO: Test hard
        
        if (cutIdx != -1) {
            const rmBuffer = cutIdx != buffer.length 
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

    constructor() {
        /** @type {number} Number of empty pages consecutively */
        this.emptyImages = 0
        /** @type {number} current image being processed*/
        this.img_processed = 0
        this.imageProcessQueueLoc = 0
        this.imageProcessQueue = []

        /** @type {number} images downloaded from stream */
        this.imgs_downloaded = 0
        /** @deprecated @type {number} images read by OCR */
        this.imgs_read = 0

        /** @type {number} Lag time is recognize a user image */
        this.lag_time = 0

        /** @type {Buffer[]} Progressive Image stream */
        // this.prgBufferArr = []
        
        // this.prgBuffer = Buffer.allocUnsafe(10 * 1028 * 1028)
        // this.prgBufferIdx = 0
        // this.prgBufferLen = 0

        /** @type {DOMHighResTimeStamp} time when 1st image was retrieved */
        this.start_time = null
    }

    /** Reset all objects to normal  */
    reset() {
        this.emptyImages = 0
        this.img_processed = 0
        this.imageProcessQueueLoc = 0
        this.imageProcessQueue = []

        this.imgs_downloaded = 0
        this.imgs_read = 0

        this.start_time = null
    }

    setStartTime() {
        this.start_time = performance.now()
    }
}

export class ServerStatus {

    static DEFAULT_VIEWER_INTERVAL = 1_000 * 3

    constructor () {
        /** @type {string} current server state */
        this.state = SERVER_STATE_ENUM.STOPPED

        this.started_game_ts = null
        this.started_read_ts = null
        this.ended_read_ts = null
        this.started_race_ts = null

        // this.debug_process = false;
        // this.debug_vod_dump = false;
        // /** @type {boolean} enable twitch monitoring  */
        // this.enableMonitor = false;

        /** @type {number} number of viewers on the site */
        this.site_viewers = 0
        /** @type {number} total number of viewers on the site */
        this.total_viewers = 0
        this.monitoredViewers = []
    }

    /** Clear all tracked values */
    clear () {
        this.started_read_ts = null
        this.ended_read_ts = null
        this.started_race_ts = null
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

    jsonReadyObj () {
        return {
            'viewers': this.site_viewers
        }
    }
    
}

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


        /** @type {number[]} verified offset per frame */
        this.offsetMatchFrame = []
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
     * @param {import('./UserNameBinarization.mjs').TrackedUsernameDetection[]} visibleUsers 
     */
    addVisibleFrame(visibleUsers) {
        this.visibleScreenFrame.push(
            visibleUsers.map(vUser => ScreenState.visibleStr(vUser)).join('')
        )
    }

    /**
     * @param {import('./UserNameBinarization.mjs').TrackedUsernameDetection} vUser
     */
    static visibleStr(vUser) {
        
        if (vUser.appear && vUser.length === null)
            return 'D'
        if (vUser.appear && vUser.unknownLen == true)
            return 'U'//'Δ'
        if (vUser.appear && vUser.matchLen == true)
            return 'K'//'Δ'
        
        if (vUser.appear)
            return 'A'
        if (vUser.length)
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
        
        if (this.offsetMatchFrame.at(-1) != 0) return true
        if (this.predictedFrame.at(-1) != this.predictedFrame.at(-2))
            return true;

        return false
    }
}