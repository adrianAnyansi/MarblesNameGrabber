/* 
Modification of the MarblesNameGrabber but changed to work with Node.js
Removes canvas elements and uses sharp instead

*/

const sharp = require("sharp")

const MEASURE_RECT = { x: 0, y:0, w: 1920, h: 1080} // All values were measured against 1080p video
const NAME_RECT = {
    x: 957/1920,
    y: 152/1080,
    w: (1504-957)/1920,
    h: (1080-154)/1080
}

class MarbleNameGrabberNode {

    nameRect = {
        x: 957/1920,
        y: 152/1080,
        w: (1504-957)/1920,
        h: (1070-152)/1080
    }
    DEBUG_NAME_RECOGN_FILE = 'testing/name_match.png'


    constructor(filename=null, debug=false) {
        // Get references, etc

        this.filename = filename // image being read
        this.imageSize = null   // {w,h} for rect of original image

        this.buffer = null      // buffer of raw pixel data
        this.bufferPromise = null   // promise that is resolved when buffer has been set
        this.bufferSize = null      // {w,h} for rect of the cropped image

        // debug will write intermediate to file for debugging
        this.debug = debug
    }

    async buildBuffer () {
        // Build sharp object and extract buffer as UInt8Array
        
        let sharpImg = sharp(this.filename)
        this.buffer = null // delete previous buffer
        this.bufferSize = null
        this.imageSize = null

        this.bufferPromise = sharpImg.metadata()
            .then( imgMetadata => {
                console.debug("Got metadata")
                this.imageSize = {w: imgMetadata.width, h: imgMetadata.height}
                let normNameRect = this.normalizeRect(this.nameRect, imgMetadata.width, imgMetadata.height)
                let sharpImgCrop = sharpImg.extract({left: normNameRect.x, top: normNameRect.y,
                        width: normNameRect.w, height: normNameRect.h })
                
                return sharpImgCrop.raw().toBuffer({ resolveWithObject: true })
            })
            .then( ({data, info}) => {
                if (data) {
                    this.bufferSize = {w: info.width, h:info.height, channels: info.channels, premultiplied: info.premultiplied }
                    this.buffer = data
                }
                return Promise.resolve(data)
            })
            .catch( err => {
                console.warn("Did not get buffer")
            })

        return this.bufferPromise
    }

    normalizeRect (rect, width, height) {
        // Expand pctRect to width/height
        return {
            x: parseInt(rect.x * width),
            y: parseInt(rect.y * height),
            w: parseInt(rect.w * width),
            h: parseInt(rect.h * height),
        }
    }

    toPixelOffset (x_coord, y_coord) {
        // Get the pixel_offset to a location
        let pixel_offset = (y_coord * this.bufferSize.w + x_coord) * 4;
        return pixel_offset
    }

    toCoord (pixel_offset) {
        // Map to coordinate
        let y_coord = parseInt(pixel_offset/4 * 1 / this.bufferSize.w) 
        let x_coord = parseInt((pixel_offset/4) % this.bufferSize.w)
        return {x: x_coord, y: y_coord}
    }

    getPixel (x,y) {
        // Return pixel colour as [R,G,B,A] value

        let px_off = this.toPixelOffset(x,y)

        const rgba = this.buffer.readUInt32LE(px_off)
        const int8mask = 0xFF

        return [
            (rgba & int8mask),
            (rgba >> 8*1) & int8mask,
            (rgba >> 8*2) & int8mask,
            (rgba >> 8*3) & int8mask,
        ]
    }

    setPixel(x,y, rgba) {
        // Set pixel colour @ x,y to [RGBA]
        let px_off = this.toPixelOffset(x,y)
        this.buffer.writeUInt8(rgba[0], px_off+0)
        this.buffer.writeUInt8(rgba[1], px_off+1)
        this.buffer.writeUInt8(rgba[2], px_off+2)
        if (rgba[3])
            this.buffer.writeUInt8(rgba[3], px_off+3)
    }

    toRGBA (hexColor) {
        const mask = 0xFF
        return [(hexColor >> 8*2) & mask,
                (hexColor >> 8*1) & mask, 
                hexColor & mask,
                0xFF]
    }


    // https://stackoverflow.com/questions/4754506/color-similarity-distance-in-rgba-color-space
    // NOTE: SO on pre-multiplied alpha, but note my colours are all 100% alpha
    redmean (rgba, rgba2) {
        // https://en.wikipedia.org/wiki/Color_difference
        // Referenced from here: https://www.compuphase.com/cmetric.htm
        // Range should be ~255*3
        const redmean = 0.5 * (rgba[0]+rgba2[0])

        const redComp   = (2+redmean/256)       * Math.pow((rgba[0]-rgba2[0]), 2)
        const greenComp =   4                   * Math.pow((rgba[1]-rgba2[1]), 2)
        const blueComp  =  (2+(255-redmean)/256) * Math.pow((rgba[2]-rgba2[2]), 2)

        return Math.sqrt(redComp+greenComp+blueComp)
    }

    sqrColorDistance (rgba, rgba2) {
        let ans = 0
        for (let idx in rgba)
            ans += Math.pow(rgba[0]-rgba2[0], 2)
        return ans
    }

    /*
    Lines are also removed without smooth animation, meaning that the lines do
    accurately sit on the line boundaries
    */

    /*
    Logic, using the offset and box size.
    Look from right->left. Multiple passes
        1. Move right to left with the dot check, mark for flood-fill
        2. When reaching 4 vertical lines without userColor, exit
        3. Flood-fill to black respecting intensity, copy to new imgData


    Initution: Simply move from right->left looking for a big color gap
        Ignore anything that matches BLACK or user colors
    */

    // Setting some default colours  
    BLACK           = 0x000000
    WHITE           = 0xFFFFFF
    STREAMER_RED    = 0xFF0000
    SUB_BLUE        = 0x7b96dc
    MOD_GREEN       = 0x00FF00
    VIP_PINK        = 0xFF00FF

    USERNAME_COLORS = new Set([
        // this.STREAMER_RED,
        this.SUB_BLUE,
        // this.MOD_GREEN,
        // this.VIP_PINK
    ])

    // percent of 1080p height
    USERNAME_BOX_HEIGHT_PCT  = ((185+1) - 152) / MEASURE_RECT.h;
    CHECK_LINES_PCT = [
        (162 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (167 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (173 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (179 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
    ]
    USERNAME_LEFT_PADDING_PCT = 5 / MEASURE_RECT.w // Left padding in pixels @ 1920

    async isolateUserNames () {
        // First, ensure buffer exists
        if (!this.buffer) {
            // this.buffer = await this.bufferPromise  // ensure this is valid
            if (this.bufferPromise) {
                console.debug("Waiting for buffer promise")
                await this.bufferPromise
            } else {
                console.debug("Building buffer")
                await this.buildBuffer()
            }
            console.debug(`Re-acquired buffer ${this.bufferSize}`)
        }

        // Start to iterate through the buffer

        const validFloodFillPos = new Set();  // Track flood fill positions
        const cacheColorMatch = new Set() // Track colors that previously matched*

        let y_start = 0;
        
        const USERNAME_LEFT_PADDING = parseInt(this.USERNAME_LEFT_PADDING_PCT * this.imageSize.w)
        const USERNAME_BOX_HEIGHT = parseInt(this.USERNAME_BOX_HEIGHT_PCT * this.imageSize.h)
        
        // const CHECK_LINE_OFF = [] // Normalize y_offsets into pixel lengths
        const CHECK_LINE_OFF = this.CHECK_LINES_PCT.map( check_offset => parseInt(check_offset * this.imageSize.h))
        // for (const check_offset of this.CHECK_LINES_PCT)
        //     CHECK_LINE_OFF.push(parseInt(check_offset * this.imageSize.h))

        const USERNAME_COLOR_ARR = Array.from(this.USERNAME_COLORS, color => this.toRGBA(color))
        const COLOR_DIFF = 60; // max

        // this.setPixel(0,0, this.toRGBA(this.STREAMER_RED))
        // let rgba_test = this.getPixel(0,0)


        // Begin iterating through the buffer
        while ( y_start < this.bufferSize.h ) {
            let x_start = this.bufferSize.w-1;
            let failedSearch = 0;

            while (x_start >= 0) {   // RIGHT->LEFT search
                let foundMatch = false;

                // check pixel on each y_band
                for (const check_px_off of CHECK_LINE_OFF) {
                    // const check_px_off = parseInt(check_offset * MEASURE_RECT.h)
                    let px_rgba = this.getPixel(x_start, y_start+check_px_off)
                    
                    this.setPixel(x_start, y_start+check_px_off, this.toRGBA(this.SUB_BLUE))
                    // console.debug(`REDMEAN to blue: ${this.redmean(this.toRGBA(this.SUB_BLUE), px_rgba)}`)

                    // if (this.USERNAME_COLORS.has(px_rgba)) { // right now checking only exact match
                    if ( cacheColorMatch.has(px_rgba) || 
                        USERNAME_COLOR_ARR.some( (color) => this.redmean(color, px_rgba) < COLOR_DIFF) 
                    ) {
                        failedSearch = 0
                        foundMatch = true
                        validFloodFillPos.add({x: x_start, y: y_start+check_px_off})
                        cacheColorMatch.add(px_rgba)

                        if (this.debug) { // set match to black
                            this.setPixel(x_start, y_start+check_px_off, 
                                this.toRGBA(this.STREAMER_RED))
                        }
                        // TODO: Skip ahead if match?
                    } else {
                        // console.debug(`Failed redmean ${this.redmean(USERNAME_COLOR_ARR[0], px_rgba)}`)
                        // console.debug(`px_color ${px_rgba}`)
                    }
                }
                
                // If no match on all check lines
                if (!foundMatch) {
                    failedSearch += 1
                    if (failedSearch > USERNAME_LEFT_PADDING) {
                        break; //break out of reading left
                    }
                }
                x_start -= 1
            }   // End RIGHT-LEFT search
            console.debug(`Ended search at ${(this.bufferSize.w-1) - x_start} P:${validFloodFillPos.size} C:${cacheColorMatch.size}`)

            y_start += USERNAME_BOX_HEIGHT;
        }

        // finish up by copying to new buffer
        if (this.debug) {
            this.writeBufferToFile(this.DEBUG_NAME_RECOGN_FILE)
        }

    }

    writeBufferToFile(filename=null) {
        // debug, write current buffer to file
        if (this.buffer) {
            sharp(this.buffer, {
                raw: {width: this.bufferSize.w, height: this.bufferSize.h, channels: this.bufferSize.channels, premultiplied: this.bufferSize.premultiplied}
            })
                .png().toFile(filename)
            console.debug(`Wrote the buffer to debug file`)
        } else {
            console.debug(`Buffer does not exist currently`)
        }
    }

}

module.exports = MarbleNameGrabberNode