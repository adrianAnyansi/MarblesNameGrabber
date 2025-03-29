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
        ['png', '-pix_fmt', 'rgba'],
        ImageFormatConstants.PNG_IEND_CHUNK,
        ImageFormatConstants.PNG_AFTER_IEND_OFFSET
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
        this.prgBuffer = []
    }

    static updatePNGFormat(ffmpeg_cmd) {
        ServerImageFormat.PNG_FORMAT.ffmpeg_cmd = ffmpeg_cmd
    }

    static updateJPGFormat(ffmpeg_cmd) {
        ServerImageFormat.JPG_FORMAT.ffmpeg_cmd = ffmpeg_cmd
    }

    /**
     * Check if buffer ends with this image
     * @param {Buffer} buffer 
     */
    checkBufferForEOF(buffer) {
        let test_data = null
        if (this.end_buffer == ServerImageFormat.JPG_END_OF_FILE) {
            test_data = buffer.readUIntBE(buffer.length - ServerImageFormat.JPG_BUFFER_SIZE, 2)
        } else {
            test_data = buffer.readUIntBE(buffer.length - ServerImageFormat.PNG_BUFFER_SIZE, 4)
        }

        return this.end_buffer == test_data
    }

    /** 
     * Split the input buffer by EOF depending on format 
     * @param {Buffer} buffer
     * @returns {[Buffer[], Buffer | null]} list of split buffers
     */
    splitBufferByEOF(buffer) {
        const bufferList = []
        let lastIdx = 0
        do {
            // NOTE: Could use different TypedArrays to skip by 4 byte chunks instead
            // also from end but rewrite both at once instead
            const EOF_LOC = buffer.indexOf(this.end_buffer, lastIdx)
            if (EOF_LOC == -1) break
            else {
                const endIdx = EOF_LOC + this.chunk_size ?? this.end_buffer.length
                bufferList.push(buffer.subarray(lastIdx, endIdx))
                lastIdx = endIdx
            }
        } while (lastIdx < buffer.length);

        return [bufferList, lastIdx != buffer.length
            ? buffer.subarray(lastIdx)
            : null
        ]
    }

    /**
     * Internally manage a progressive buffer
     * @param {Buffer} buffer 
     * @returns {Buffer[]} buffer if a new one
     */
    progressiveBuffer(buffer) {
        const [bufferList, remainBuffer] = this.splitBufferByEOF(buffer)
        if (bufferList.length != 0) {
            // add prgBuffer to first buffer
            const cmbBuffer = Buffer.concat([...this.prgBuffer, bufferList[0]])
            bufferList[0] = cmbBuffer
            this.prgBuffer = []
        }
        if (remainBuffer) {
            this.prgBuffer.push(remainBuffer)
        }
        return bufferList
    }
}

/**
 * Keeps track of downloaded images
 * Also tracks the time to know when the image 
 */
export class ServerImageTracking {

    constructor() {
        /** @type {number} Number of empty pages */
        this.emptyImages = 0
        /** @type */
        this.imageProcessId = 0
        this.imageProcessQueueLoc = 0
        this.imageProcessQueue = []

        /** @type {Buffer[]} Progressive Image stream */
        this.prgBuffer = []

        /** @type {DOMHighResTimeStamp} time when 1st image was retrieved */
        this.start_time = null
    }

    /** Reset all objects to normal  */
    reset() {
        this.emptyImages = 0
        this.imageProcessId = 0
        this.imageProcessQueueLoc = 0
        this.imageProcessQueue = []
        this.prgBuffer = []

        this.imgs_downloaded = 0
        this.imgs_read = 0

        this.start_time = null
    }

    setStartTime() {
        this.start_time = performance.now()
    }
}