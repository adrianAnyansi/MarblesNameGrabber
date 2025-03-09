/* 
Modification of the MarblesNameGrabber but changed to work with Node.js
Removes canvas elements and uses sharp instead

*/

import sharp from 'sharp'
import { Buffer } from 'node:buffer'
import { rotPoint, toPct } from './DataStructureModule.mjs'
import { PixelMeasure, Color, BufferView, ImageTemplate, ImageBuffer, Direction2D } from './UtilModule.mjs'
import {resolve} from 'node:path'
import fs from 'fs'

export class ColorSpace {
    /**
     * Create a new ColorSpace object
     * @param {[Number]} min 
     * @param {[Number]} max 
     * @param {[Number]} center 
     * @param {[Number]} rot 
     */
    constructor(min, max, center, rot) {
        this.min = min
        this.max = max
        this.center = center
        this.rot = rot
    }
    
    /**
     * Helper function to import from json object
     * @param {*} jsonObj 
     */
    static Import(jsonObj) {
        let retObj = new ColorSpace(jsonObj.min, jsonObj.max, jsonObj.center, jsonObj.rot)
        return retObj
    }

    /**
     * Checks if sent point is within the colorSpace
     * NOTE: alpha is discarded
     * @param {*} point 
     */
    check (point) {
        const t_point = point.slice(0,3)

        // const t_point = [0,0,0]
        // for (const idx in t_point)
        //     t_point[idx] = point[idx] - this.center[idx]

        const r_point = rotPoint(this.rot, t_point)
        
        for (const idx in this.min) {
            if (r_point[idx] < this.min[idx]) return false
            if (r_point[idx] > this.max[idx]) return false
        }
        return true
    }
}

// External programming things
const START_NAME_LOCS = JSON.parse(fs.readFileSync(resolve("data/startpixels.json"), 'utf8'))
const COLORSPACE_JSON = JSON.parse(fs.readFileSync(resolve("data/colorspace.json"), 'utf8'))

const COLORSPACE_OBJ = {
    WHITE: ColorSpace.Import(COLORSPACE_JSON.WHITE),
    BLUE: ColorSpace.Import(COLORSPACE_JSON.BLUE)
}

// ==========================================
// Utility functions
// ==========================================

/**
 * 
 * @param {*} colorList 
 * @returns {[Number, Number]}
 */
function calcMinColorDistance (colorList) {
    // binary search across each color channel
    const redRange =    [0,255]
    const blueRange =   [0,255]
    const greenRange =  [0,255]

    const ranges = [redRange, blueRange, greenRange]
    const midOfRange = range => parseInt((range[1] - range[0])/2) + range[0]

    const RGBA_LIST = colorList.map( c => Color.toRGBA(c))
1
    while (ranges.some(range => range[0] < range[1])) {
        
        for (let idx in ranges) {
            const range = ranges[idx]
            if (range[0] >= range[1]) continue
            // let mid = parseInt((range[1] - range[0])/2) + range[0]
            let rgbaTest = [midOfRange(ranges[0]), midOfRange(ranges[1]), midOfRange(ranges[2])]
            let maxColorDist = Math.max(...RGBA_LIST.map( rgbaC => Color.redmean(rgbaTest, rgbaC)))

            rgbaTest[idx] = (rgbaTest[idx]+1) % 255
            let maxRightColorDist = Math.max(...RGBA_LIST.map( rgbaC => Color.redmean(rgbaTest, rgbaC)))

            rgbaTest[idx] = Math.max((rgbaTest[idx]-2), 0)
            let maxLeftColorDist = Math.max(...RGBA_LIST.map( rgbaC => Color.redmean(rgbaTest, rgbaC)))

            let midPoint = midOfRange(ranges[idx])

            if (maxColorDist < maxRightColorDist) {
                ranges[idx][1] = midPoint-1
            } else if (maxColorDist < maxLeftColorDist) {
                ranges[idx][0] = midPoint+1
            } else {
                ranges[idx][0] = ranges[idx][1]
            }
        }
    }

    const retRGBA = ranges.map( range => range[0])

    return [retRGBA, Math.max(...RGBA_LIST.map( c => Color.redmean(retRGBA, c)))]
}

// Define color space
const colorSampling = {
    SUB_BLUE: [0x7b96dc, 0x6c97f5, 0x7495fa, 0x7495fa, 0x8789ec, 0x7294ec, 0x7298e6, 0x799aff, 0x7b95f7, 0x7897fa,
                0x846ed9, 0x577ac9, 0x809ae7, 0x8e95d4, Color.toHex([87, 164, 255]), Color.toHex([158, 180, 251]), 
                Color.toHex([111, 128, 209]), Color.toHex([139, 145, 242]), Color.toHex([136, 123, 185]), 
                // 0xA2ACCC, 0x818CDE, 0x7C95E4, 0x5696FB, 0x619AF6
            ],
    UNSUB_WHITE: [0xfffefb, 0xfef8f5, 0xfcf6f3, 0xd0c9c7, 0xcfc8c5, 0xece5e2, 0xd1cbc8, 0xbdbdb9,  0xc9c2c0, 0xc3bdba,
                    0xFFFEFF, 0xFFFFFF, 0xE5E5E7, 0xFFFFFD, 0xFFFAF7,
                    Color.toHex([216, 216, 216]), 
            ],
    // VIP_PINK: [0xE824B8, 0x9D126D, 0xDD20C2, 0xEC22C4, 0xe999cf],
    VIP_PINK: [0xfc92d8, 0xe795d1, 0xff8ddb, 0xfa8bd6, 0xff8ed4, 0xeb8ccc, 0xf494d5, 0xef9bcc, 0xf88fd3, 0xda79c2, 0xea95cb],
    FOUNDER: [0xed21d7, 0xff12bf, 0xd736b2, 0xff25d0, 0xdc25bc, 0xd431b7, 0xc31a97, 0xeb23c7, 0xcf36ac, 0xf522c5, 0xef28e6],
    STREAMER_RED: [0xfc9eaf, 0xe38b9d, 0xe992a7, 0xe8809a, 0xdc7169, 0xe15b83, 0xe8809a, 0xe18b98, 0xe1918e, 0xf57f7d, 0xff96a0, 0xf58071, 0xff8394]
    // TEST:       [0x000000, 0x101010, 0x040404]
}


const userColors = {}
for (let color in colorSampling) {
    userColors[color] = calcMinColorDistance(colorSampling[color])
}

const cacheColorMatch = new Map(Object.values(userColors).map(color => [color, new Map()]))

// ------------------

const screenSampling = {
    DARK_GRAY :  [0x21303f, 0x1e303f, 0x23323c, 0x263141, 0x233241, 0x21303c, 0x1e3138, 0x26313f, 0x232e3f, 0x1e2a37],
    ORANGE: [0xff5921, 0xfd5515, 0xff5921, 0xfa570f, 0xf26021, 0xf95400, 0xda5823, 0xf9560e, 0xc44007, 0xf9560e, 0xe54600, 0xda5823, 0xfd560b ]
}

const screenColorRanges = {}
for (let color in screenSampling) {
    screenColorRanges[color] = calcMinColorDistance(screenSampling[color])
}

const PRE_RACE_RECT_ORANGE = {
    x: 1130/1920,
    y: 98/1080,
    w: (1244-1130)/1920,
    h: (101-98)/1080
}

const PRE_RACE_RECT_GRAY = {
    x: 1135/1920,
    y: 105/1080,
    w: (1196-1135)/1920,
    h: (145-105)/1080
}



// CLASS
/**
 * Main class for cutting and parsing Username iamges from the Marbles UI
 */
export class UserNameBinarization {

    /** @type {import('./UtilModule.mjs').RectObj} rectangle for cropped usernames */
    static NAME_CROP_RECT = {
        x: 1652-264,
        y: 125,
        w: 267,
        h: 955,
    }
    /** @type {Number} Width that the image is scaled to (in pixels) for best pixel density */
    static OCR_WIDTH = 1000;
    
    /** Pixels to check right-to-left, giving up after X pixels without a match */
    static USERNAME_MAX_LETTER_CHECK = 10;
    /** Number of pixels minimum to check (around 3 letters) */
    static USERNAME_MIN_CHECK = 40;
    /** Username height in vertical pixels */
    static USERNAME_HEIGHT = 40;

    // Vertical Pixels from the top of the username box
    static CHECK_LINES = [
        3, 5, 7, 9, 11,12, 14, 15, 16, 20, 22, 24, 28, 30, 32
    ]
    /** Lines to ignore (check for non letter colours) to indicate end of line */ 
    static ANTI_LINES = [
        2, 37
    ]
    
    DEBUG_NAME_RAW_FILE    = 'testing/name_crop.png'
    DEBUG_NAME_RECOGN_FILE = 'testing/name_match.png'
    DEBUG_NAME_BIN_FILE     = 'testing/name_bin.png'

    constructor(imageLike=null, debug=false, imgOptions={}) {
        // Get references, etc
        /** @type {ImageLike} image being read */
        this.imageLike = imageLike
        /** @type {import('./UtilModule.mjs').RectBounds} {w,h} for rect of original image */
        this.imageSize = null

        /** @type {Buffer} buffer used to write the orig buffer before edits because PROD makes little edits, only DEBUG makes a full-copy at isolateUserNames */
        this.orig_buffer = null
        /** @type {Buffer} cropped buffer of raw name pixel data */
        this.buffer = null
        /** @type {Buffer} binarized buffer of black text on a white background */
        this.binBuffer = null
        /** @type {import('./UtilModule.mjs').RectBounds} {w,h} for rect of the cropped image */
        this.bufferSize = null

        /** @type {PixelMeasure} basis to scale pixels to based on image metadata */
        this.RES_BASIS = null

        /** @type {Booelan} debug flag will write intermediate to file for debugging */
        this.debug = debug

    }

    /**
     * Build buffer & etc using a cropped buffer instead of the full buffer
     */
    async quickBuffer (bufferCrop, imgMetadata, info) {
        this.buffer = null // delete previous buffer
        this.bufferSize = null
        this.imageSize = null

        this.imageSize = {w: imgMetadata.w, h: imgMetadata.h}
        this.RES_BASIS = new PixelMeasure(imgMetadata.w, imgMetadata.h);
        this.bufferSize = {w: info.w, h:info.h, channels: info.channels, premultiplied: info.premultiplied, size: info.size }

        this.buffer = bufferCrop
        if (!this.debug) this.orig_buffer = this.buffer
        this.binBuffer = Buffer.alloc(info.size, new Uint8Array(Color.WHITE))

        // Resolve an arbitary promise
        return Promise.resolve()
    }

    async buildBuffer () {
        // Build sharp object and extract buffer as UInt8Array

        if (this.buffer) return this.buffer
        
        const sharpImg = sharp(this.imageLike)
        this.buffer = null // delete previous buffer
        this.bufferSize = null
        this.imageSize = null

        return sharpImg.metadata()
            // build  when metadata is retrieved
            .then( imgMetadata => {
                // console.debug("Got metadata")
                this.imageSize = {w: imgMetadata.width, h: imgMetadata.height}
                this.RES_BASIS = new PixelMeasure(imgMetadata.width, imgMetadata.height);
                // const normNameRect = this.normalizeRect(this.nameRect, imgMetadata.width, imgMetadata.height)
                const normNameRect = this.RES_BASIS.normalizeRect(UserNameBinarization.NAME_CROP_RECT);
                let sharpImgCrop = sharpImg.extract({left: normNameRect.x, top: normNameRect.y,
                        width: normNameRect.w, height: normNameRect.h })
                
                return sharpImgCrop.raw().toBuffer({ resolveWithObject: true })
            })
            // Build cropped buffer
            .then( ({data, info}) => {
                if (data) {
                    this.bufferSize = {w: info.width, h:info.height, channels: info.channels, premultiplied: info.premultiplied, size: info.size }
                    
                    this.buffer = data
                    if (!this.debug) this.orig_buffer = this.buffer
                    this.binBuffer = Buffer.alloc(info.size, new Uint8Array(Color.WHITE))
                }
                return this.buffer
            })
            .catch( err => {
                console.warn(`Did not get buffer Error:${err}`)
                throw err
            })
    }

    /**
     * This dumps the buffer & metadata for the cropped image
     */
    async dumpInternalBuffer () {
        return {
            buffer:      this.buffer,
            imgMetadata: this.imageSize,
            info:        this.bufferSize
        }
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
        return (y_coord * this.bufferSize.w + x_coord) * this.bufferSize.channels;
    }

    /**
     * @returns {[Number, Number, Number, Number]} 
     * Returns pixel rgba value from cropped buffer */
    getPixel (x,y) {
        const px_off = this.toPixelOffset(x,y)
        const rgba = this.buffer.readUInt32LE(px_off)
        const int8mask = 0xFF

        return [
            (rgba & int8mask),
            (rgba >> 8*1) & int8mask,
            (rgba >> 8*2) & int8mask,
            (rgba >> 8*3) & int8mask,
        ]
    }

    /**
     * Static get RGBA value of pixel at particular location
     * @param {Number} x 
     * @param {Number} y 
     * @param {Buffer} buffer 
     * @param {*} info 
     * @returns {[Number, Number, Number, Number]} RGBA
     */
    static getPixelStatic (x, y, buffer, info) {
        const px_off = UserNameBinarization.toPixelOffsetStatic(x, y, info)
        const rgba = buffer.readUInt32LE(px_off)
        const int8mask = 0xFF

        return [
            (rgba & int8mask),
            (rgba >> 8*1) & int8mask,
            (rgba >> 8*2) & int8mask,
            (rgba >> 8*3) & int8mask,
        ]
    }

    /**
     * Get flat pixel offset from x,y values
     * @param {Number} x 
     * @param {Number} y 
     * @param {*} info
     * @returns {Number} px_offset
     */
    static toPixelOffsetStatic (x_coord, y_coord, info) {
        const w_pixels = info?.w ?? info?.width
        return (y_coord * w_pixels + x_coord) * info.channels;
    }

    static setPixel(x, y, rgba, buffer, info) {
        const px_off = UserNameBinarization.toPixelOffsetStatic(x,y, info)
        buffer.writeUInt8(rgba[0], px_off+0)
        buffer.writeUInt8(rgba[1], px_off+1)
        buffer.writeUInt8(rgba[2], px_off+2)
        if (rgba[3])
            buffer.writeUInt8(rgba[3], px_off+3)
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

    setBinPixel(x,y, rgba) {
         // Set pixel colour @ x,y to [RGBA]
         let px_off = this.toPixelOffset(x,y)
         this.binBuffer.writeUInt8(rgba[0], px_off+0)
         this.binBuffer.writeUInt8(rgba[1], px_off+1)
         this.binBuffer.writeUInt8(rgba[2], px_off+2)
         if (rgba[3])
             this.binBuffer.writeUInt8(rgba[3], px_off+3)
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
    /**
     * Performs the large task of separating background from names & isolating thresholds to
     * create a binarized image for OCR.
     * @returns Binarized PNG imatge
     */
    async isolateUserNames () {
        // First, ensure buffer exists
        await this.buildBuffer()

        if (this.debug) {
            if (!this.orig_buffer) {
                this.orig_buffer = Buffer.alloc(this.buffer.length)
                this.buffer.copy(this.orig_buffer)
            }
            this.bufferToFile(this.DEBUG_NAME_RAW_FILE, this.orig_buffer, false)
        }

        // Setup variables for buffer iteration

        /** @type {number} y_coord */
        let y_start = 0;
        
        /** Pixels to check right-to-left, giving up after X pixels without a match */
        const USERNAME_LEFT_PADDING = this.RES_BASIS.getHorizUnits(
            UserNameBinarization.USERNAME_MAX_LETTER_CHECK)
        /** Number of pixels minimum to check (around 3 letters) */
        const USERNAME_RIGHT_MIN = this.RES_BASIS.getHorizUnits(
            UserNameBinarization.USERNAME_MIN_CHECK)
        /** Username height in converted pixels */
        const USERNAME_BOX_HEIGHT = this.RES_BASIS.getVerticalUnits(
            UserNameBinarization.USERNAME_HEIGHT)

        // Normalize y_offsets into pixel lengths
        const CHECK_LINE_OFF = UserNameBinarization.CHECK_LINES.map( 
            check_offset => this.RES_BASIS.getVerticalUnits(check_offset))
        const ANTI_LINE_OFF = UserNameBinarization.ANTI_LINES.map( 
            check_offset => this.RES_BASIS.getVerticalUnits(check_offset))

        const USERNAME_COLOR_RANGE_ARR = Object.values(userColors)
        
        /** @type {number} flood-fill depth stat */
        let depthInit = 0
        /** @type {number} flood fill stat */
        let floodFillUse = 0

        // Begin iterating through the buffer
        // ------------------------------------------------------------------------------------

        while ( y_start <= this.bufferSize.h ) {     // Per vertical line
            /** x_coord, starts from right edge */
            let x_start = this.bufferSize.w-1;
            /** @type {number} number of full vertical pixel lines that have not matched  */
            let failedMatchVertLines = 0;
            /** @type {color} first matched color in range */
            let firstColorRangeMatch = null

            while (x_start >= 0) {   // RIGHT->LEFT search
                /** @type {Boolean} color match found on this line */
                let foundMatch = false;

                // verify anti-line, matches here stop iteration
                for (const anti_line_off of ANTI_LINE_OFF) {
                    if (y_start+anti_line_off >= this.bufferSize.h) break // out of buffer

                    const px_rgba = this.getPixel(x_start, y_start+anti_line_off)
                    if (this.debug) this.setPixel(x_start, y_start+anti_line_off, Color.YELLOW)

                    if (px_rgba[3] < Color.DEFAULT_ALPHA) continue // this has been visited, and due to anti-flood-fill I can ignore this
                    if ( USERNAME_COLOR_RANGE_ARR.some( ([color, range])  => Color.redmean(color, px_rgba) < range) ) {
                        failedMatchVertLines = Infinity
                        if (this.debug) this.setPixel(x_start, y_start+anti_line_off, Color.ORANGE)
                        break // do not continue iterating
                    }
                }

                // check pixel on each vertical pixel
                for (const check_px_off of CHECK_LINE_OFF) {
                    if (y_start+check_px_off >= this.bufferSize.h) break // out of buffer
                    
                    if (failedMatchVertLines == Infinity) break // break-flag due to anti-line

                    const px_rgba = this.getPixel(x_start, y_start+check_px_off)

                    if (px_rgba[3] < 0xFF) { // previously visited
                        if (px_rgba[3] == Color.MATCH_ALPHA) {
                            failedMatchVertLines = 0
                            foundMatch = true
                        }
                        continue
                    }
                    
                    // const cacheCheck  = Array.from(cacheColorMatch.entries()).find(([color, map]) => map.get(hashArr(px_rgba)))
                    // const colorRange = inCache ? inCache[0] : 
                    //     USERNAME_COLOR_RANGE_ARR.find( ([color, range])  => redmean(color, px_rgba) < range )
                    // let colorRange = cacheCheck?.[0] ?? USERNAME_COLOR_RANGE_ARR.find( ([color, range])  => redmean(color, px_rgba) < range )
                    // const colorCacheMap = cacheCheck?.[1] ?? null

                    /** matched color (if any) */
                    const colorRange = USERNAME_COLOR_RANGE_ARR.find( (colorRange)  => {
                        const [color, range] = colorRange
                        const cacheMap = cacheColorMatch.get(colorRange)
                        if (!cacheMap.has(Color.hashRGB(px_rgba)) )
                            cacheMap.set(Color.hashRGB(px_rgba), Color.redmean(color, px_rgba))
                        
                        const cacheRedMean = cacheMap.get(Color.hashRGB(px_rgba))
                        return cacheRedMean < range 
                    })

                    if ( colorRange != undefined) {
                        // color switched while iterating the line
                        if (x_start > (this.bufferSize.w - USERNAME_RIGHT_MIN) 
                            && firstColorRangeMatch 
                            && colorRange != firstColorRangeMatch) {  
                            // console.warn(`Color match redone at ${y_start+check_px_off}`)
                            if (this.debug) this.setPixel(x_start, y_start+check_px_off, Color.BRIGHT_GREEN)
                            continue
                        }

                        failedMatchVertLines = 0
                        foundMatch = true
                        firstColorRangeMatch = colorRange
                        
                        // do flood-fill
                        cacheColorMatch.get(colorRange).set(Color.hashRGB(px_rgba), Color.redmean(colorRange[0], px_rgba)) // Flood fill set twice?
                        depthInit += 1
                        
                        const anti_y_lines = new Set(ANTI_LINE_OFF.map(y_line => y_line + y_start))
                        floodFillUse += this.floodFillSearch(x_start, y_start+check_px_off, 
                                                colorRange, cacheColorMatch.get(colorRange),
                                                anti_y_lines, 2)
                    } else if (this.debug) 
                        this.setPixel(x_start, y_start+check_px_off, Color.HOT_PINK)
                }
                
                // continue if not past 3 characters
                if (x_start > (this.bufferSize.w - USERNAME_RIGHT_MIN)) foundMatch = true

                // If no match on all check lines
                if (!foundMatch)  failedMatchVertLines += 1

                if (failedMatchVertLines > USERNAME_LEFT_PADDING) {
                    break; //break out of reading left
                }
                x_start -= 1
            }   // End RIGHT-LEFT search

            // console.debug(`Ended search at ${(this.bufferSize.w-1) - x_start} M:${depthInit} Flood-fill:${floodFillUse}`)

            y_start += USERNAME_BOX_HEIGHT;
        }

        // finish up by copying to new buffer
        if (this.debug) {
            this.bufferToFile(this.DEBUG_NAME_RECOGN_FILE, this.buffer, false)
            this.bufferToFile(this.DEBUG_NAME_BIN_FILE, this.binBuffer, true)
        }

        return this.bufferToPNG(this.binBuffer, true).toBuffer()
    }

    // search out diagonally 
    floodFillSearch (x, y, colorKey, colorCache, yBoundSet, expand=2) {

        let breathIterCount = 0
        const offsetCoord = [[0,1], [1,1], [1,0], [1,-1], [0,-1], [-1,-1], [-1,0], [-1,1]]
        const [matchColor, matchRange] = colorKey
        const floodFillQueue = [] // [x,y,exp]

        floodFillQueue.push( ...offsetCoord.map( ([tx,ty]) => [x+tx, y+ty, expand]))

        // We know x,y matches, set alpha and overwrite main
        let fst_px_rgba = this.getPixel(x,y)
        if (this.debug) Color.copyTo(fst_px_rgba, Color.RED)
        fst_px_rgba[3] = Color.MATCH_ALPHA
        
        this.setBinPixel(x,y, Color.BLACK)
        this.setPixel(x,y, fst_px_rgba)

        while (floodFillQueue.length > 0) {
            const coord = floodFillQueue.pop(0)
            const [cx, cy] = coord
            if (cx < 0 || cx >= this.bufferSize.w || cy < 0 || cy >= this.bufferSize.h) continue
            
            let px_rgba = this.getPixel(cx, cy)
            if (px_rgba[3] != Color.DEFAULT_ALPHA) continue    // already visited

            breathIterCount += 1

            let redMeanValue = null
            // let redMeanValue = redmean(matchColor, px_rgba)
            const arrHashValue = Color.hashRGB(px_rgba)
            if (colorCache.has(arrHashValue)) {
                // console.debug('Cache Hit!')
                redMeanValue = colorCache.get(arrHashValue)
            } else {
                redMeanValue = Color.redmean(matchColor, px_rgba)
                colorCache.set(arrHashValue, redMeanValue)
            }

            const matchPxUNColorBool = redMeanValue < matchRange;

            if (matchPxUNColorBool && yBoundSet.has(cy)) {
                // out-of-bounds, reverse flood-fill
                // console.debug("Reverse flood-fill triggered")
                this.antiFloodFillSearch(cx, cy)
                return 0
            }

            const chOffset = Math.max(0, (redMeanValue - matchRange)/3)
            const EXP_FALLOFF = 3
            const avgCh = parseInt( 0xFF - ((0xFF - chOffset)**EXP_FALLOFF) / 0xFF**(EXP_FALLOFF-1) ) // log fall-off
            const bw_rgba = [avgCh, avgCh, avgCh, 0xFF]

            this.setBinPixel(cx, cy, bw_rgba) // set in binBuffer
            
            if (this.debug) {
                Color.copyTo(px_rgba, (matchPxUNColorBool ? Color.MAHOGANY : Color.MAHOGANY_DARK))
            }
            px_rgba[3] = matchPxUNColorBool ? Color.MATCH_ALPHA : Color.NO_MATCH_ALPHA
            this.setPixel(cx, cy, px_rgba)

            if ( coord[2] > 0 || matchPxUNColorBool ) {
                // queue adjacent squares
                const expand = matchPxUNColorBool ? coord[2] : coord[2] - 1
                floodFillQueue.push( ...offsetCoord.map( ([tx,ty]) => [cx+tx, cy+ty, expand]))
            }
        }

        return breathIterCount

    }

    // flood fill but only visited
    antiFloodFillSearch (x, y) {

        let breathIterCount = 0
        const offsetCoord = [[0,1], [1,1], [1,0], [1,-1], [0,-1], [-1,-1], [-1,0], [-1,1]]
        const floodFillQueue = [] // [x,y,exp]

        floodFillQueue.push( ...offsetCoord.map( ([tx,ty]) => [x+tx, y+ty, -1]))

        // We know x,y matches, set alpha and overwrite main
        let fst_px_rgba = this.getPixel(x,y)
        if (this.debug) fst_px_rgba = Color.ORANGE
        fst_px_rgba[3] = Color.ANTI_MATCH_ALPHA
        
        this.setBinPixel(x,y, Color.WHITE)
        this.setPixel(x,y, fst_px_rgba)

        while (floodFillQueue.length > 0) {
            const coord = floodFillQueue.pop(0)
            const [cx, cy, expand] = coord
            if (cx < 0 || cx >= this.bufferSize.w || cy < 0 || cy >= this.bufferSize.h) continue
            
            let px_rgba = this.getPixel(cx, cy)
            // NOTE: This checks == to DEFAULT_ALPHA
            if (px_rgba[3] <= Color.ANTI_MATCH_ALPHA || px_rgba[3] == 0xFF) continue    // already visited by anti-fill

            breathIterCount += 1

            this.setBinPixel(cx, cy, Color.WHITE) // remove pixel from binBuffer
            if (this.debug)
                Color.copyTo(px_rgba, Color.YELLOW)
            
            px_rgba[3] = Color.ANTI_MATCH_ALPHA
            this.setPixel(cx, cy, px_rgba)

            floodFillQueue.push( ...offsetCoord.map( ([tx,ty]) => [cx+tx, cy+ty, -1]))
        }

        return breathIterCount
    }

    /**
     * Returns true if matches the px of Marbles pre-race screen
     * DEPRECATED; UI changed
     * @deprecated
     * @returns {Boolean}
     */
    async checkValidMarblesNamesImg() {
        // pick random px in box, then test range
        const {data, info} = await sharp(this.imageLike).raw().toBuffer( { resolveWithObject: true })

        const normOrangeRect = this.normalizeRect(PRE_RACE_RECT_ORANGE, info.width, info.height)
        const normGrayRect = this.normalizeRect(PRE_RACE_RECT_GRAY, info.width, info.height)

        // const getPxOffset = (x_coord, y_coord) => (y_coord * info.width + x_coord) * info.channels;
        // const getPx = (pxOffset) => 

        // Test at least 50%
        function testRect (rect, colorRange) {
            let testResult = 0
            let testTotal = 0
            const iw = Math.ceil(rect.w * (1/60))
            const ih = Math.ceil(rect.h * (1/60))

            for (let i=0; i<rect.w; i+=iw) {
                for (let j=0; j<rect.h; j+=ih) {
                    testTotal += 1
                    if ( Color.redmean(UserNameBinarization.getPixelStatic(rect.x+i, rect.y+j, data, info), colorRange[0]) < colorRange[1] ) {
                        testResult += 1
                    }
                }
            }
            return (testResult/testTotal) > 0.6
        }

        if (testRect(normOrangeRect, screenColorRanges.ORANGE) && testRect(normGrayRect, screenColorRanges.DARK_GRAY)) {
            return true
        }
        return false
    }

    /**
     * Returns true if the white "Waiting for Start" is visible
     * @deprecated
     */
    async checkWaitingForStartImg() {

        // get buffer of specific area
        const {data, info} = await sharp(this.imageLike).raw().toBuffer( { resolveWithObject: true })

        // const waitingForStartBox = this.normalizeRect(RECT.WAITING_FOR_RECT, info.width, info.height)

        // Now check all pixels in range with that colorspace
        const minMatch = 0.9
        let matchCount = 0
        let totalCount = 0
        // let failSet = new Set()
        // const setStr = () => {
        //     let str = ''
        //     for (let px of failSet) str += `${px}, `
        //     return str.trim()
        // }

        for (const px_loc of START_NAME_LOCS) {
            const px_val = UserNameBinarization.getPixelStatic(px_loc[0], px_loc[1], data, info)
            totalCount += 1
            if (COLORSPACE_OBJ.WHITE.check(px_val)) 
                matchCount += 1
            // else
            //     failSet.add(`${px_val}`)

            if ((totalCount - matchCount) / START_NAME_LOCS.length > (1-minMatch)) {
                // console.log(`FAILED: ${setStr()}`)
                return false
            }
        }
        // console.log(`FAILED: ${setStr()}`)
        return true
    }

    
    static START_BUTTON_TEMPLATE = new ImageTemplate(
        'data/start_btn.png',
        {x:1136, y:1030, w:104, h:46},
        "Start button");

    static SUBSCRIBERS_TEMPLATE = new ImageTemplate(
        'data/subscribers.png',
        {x:1703, y:130, w:128, h:25},
        "Subscribers"
    )

    static GAME_SETUP_TEMPLATE = new ImageTemplate(
        'data/game_setup_tmp.png',
        {x:577, y:967, w:135, h:24},
        "Game Setup"
    )

    static PRE_RACE_START_W_DOTS_TEMPLATE = new ImageTemplate(
        'data/start_with_dots.png',
        {x:1018, y:73, w:182, h:49},
        "Start..."
    )

    static EVERYONE_TEMPLATE = new ImageTemplate(
        'data/everyone.png',
        {x:24, y:132, w:102, h:23},
        "Everyone"
    )

    /**
     * Check if image at a specific location
     * @param {import('./UtilModule.mjs').RectObj} rectObj
     * @param {ImageTemplate} imgTemplate
     * @param {Number} PASS_PCT
     */
    async checkImageAtLocation(imgTemplate, PASS_PCT=0.7) {
        /** Helper object for accessing image rect */
        const rectObj = imgTemplate.rectObj;
        /** Running total of compared pixels. Ignores pixels with alpha < threshold */
        let imgPxTotal = rectObj.w * rectObj.h;
        /** total of all pixels */
        const fixedTotal = imgPxTotal;

        const magicDivNum = fixedTotal % 13 != 0 ? 13 : 12;
        
        const magicNum = Math.trunc(fixedTotal / magicDivNum);
        const ALPHA_THRESHOLD = 200;
        const CHANNEL_MEAN_THRESHOLD = 20;
        const MAX_PX_COMPARE = 0.3;
        const MIN_PX_COMPARE = 0.05;
        const visitedSet = new Set();

        // cut the same image out from the main buffer to keep same x/y
        const cropBufferView = await BufferView.Build(this.imageLike, rectObj)
        // Get bufferView
        /** @type {BufferView} */
        const imgView = await imgTemplate.getBufferView();

        const incrCurrPxCounter = () => {currPx = (currPx + magicNum) % fixedTotal};
        
        /** Pixels that have been compared */
        let checkedPxTotal = 0;
        /** pixels that matched */
        let pxMatchCount = 0
        /** current pixel being tested */
        let currPx = 0;
        // Loop maximum of certain pct
        while (checkedPxTotal < imgPxTotal * MAX_PX_COMPARE) {
            if (visitedSet.has(currPx)) {
                incrCurrPxCounter();
                continue;
            }
            visitedSet.add(currPx);

            const [x, y] = imgView.getCoord(currPx)
            const rgba = imgView.getPixel(x,y);
            
            if (rgba[3] < ALPHA_THRESHOLD) {
                imgPxTotal -= 1; // ignore pixel from total
            } else {
                checkedPxTotal += 1;
                const c_rgba = cropBufferView.getPixel(x, y)

                // compare color values
                let ch_mean = Color.compareMean(rgba, c_rgba);
                if (ch_mean <= CHANNEL_MEAN_THRESHOLD) {
                    pxMatchCount += 1
                }
            }

            // console.debug(`Compare pct was ${pxMatchCount / checkedPxTotal}%`)
            if (checkedPxTotal > imgPxTotal * MIN_PX_COMPARE &&
                pxMatchCount / checkedPxTotal > PASS_PCT) {
                    console.debug(`Compare pct was ${imgTemplate.name}: ${toPct(pxMatchCount / checkedPxTotal)}`)
                    return true
                }
            
            incrCurrPxCounter();
        }
        console.debug(`Compare pct failed  ${imgTemplate.name}: ${toPct(pxMatchCount / checkedPxTotal)}`)
        return false;
    }

    async validateMarblesPreRaceScreen() {
        const generic_buffer = 0.05;

        return (
            await mng.checkImageAtLocation(
                UserNameBinarization.START_BUTTON_TEMPLATE, 0.85-generic_buffer)
            ||
            await mng.checkImageAtLocation(
                UserNameBinarization.PRE_RACE_START_W_DOTS_TEMPLATE, 0.90-generic_buffer)
            ||
            await mng.checkImageAtLocation(
                UserNameBinarization.GAME_SETUP_TEMPLATE, 0.9-generic_buffer)
            ||
            await mng.checkImageAtLocation(
                UserNameBinarization.SUBSCRIBERS_TEMPLATE, 0.9-generic_buffer)
        )
    }

    /**
     * Search image for white username bounding box at locations
     * @param {number[]} usersToCheck check slots [0-23]. Empty list is 0-23, ignore exceptions
     * @param {Object} checkDetails 
     * @param {boolean} [checkDetails.appear=true] check that this user exists (right line)
     * @param {boolean} [checkDetails.length=true] check the length of the user
     * @param {boolean} [checkDetails.quickLength=null] check length at x_coord
     * 
     * @returns {Object} retObj, sparse* array {appear:bool, length:number, quickLen:bool}
     */
    async getUNBoundingBox(usersToCheck=[], {appear=true, length=true, quickLength=null}) {

        const {data, info} = await sharp(this.imageLike).raw().toBuffer( { resolveWithObject: true })
        const imgBuffer = new ImageBuffer(data, info.width, info.height, info.channels)
        const buffer = data
        // leftEdge is at 1694* 
        // Going to do edge detection across this

        const startMarkName = "userbox-start"
        performance.mark(startMarkName)

        const UN_TOP_Y = 125;
        const UN_RIGHT_X = 1574+120;
        const UN_BOX_HEIGHT = UserNameBinarization.USERNAME_HEIGHT;
        
        // let user_y_start = username_top;
        const userBoxList = []
        for (let i=0; i<24; i++) {
            userBoxList[i] = {}
        }
        // const userBoxLenList = []
        
        // let userIndex = 0;
        if (usersToCheck.length == 0)
            usersToCheck = Array.from(Array(24).keys())

        // while (user_y_start < 1080 - username_box_height) { // per username
        for (const userIndex of usersToCheck) {

            const user_y_start = UN_TOP_Y + UN_BOX_HEIGHT * userIndex

            const userstart = 'userstart'
            performance.clearMarks(userstart)
            performance.mark(userstart)

            // check the right side wall
            if (appear) {
                // TODO: Reduce the num of checks here
                const APPEAR_MIN = 10
                let right_match = 0
                for (let d=0; d < UN_BOX_HEIGHT/2; d++) {
                    if (user_y_start+d >= imgBuffer.height) break
                    const rightLine = this.checkLine(UN_RIGHT_X, user_y_start+d, imgBuffer, 1, Direction2D.LEFT)
                    if (rightLine) {
                        right_match++
                        if (this.debug) imgBuffer.setPixel(UN_RIGHT_X, user_y_start+d, Color.RED)
                    }
                    if (right_match > APPEAR_MIN) {
                        break;
                    }
                }
                
                userBoxList[userIndex].appear = (right_match > APPEAR_MIN) // update value in userList
                // console.log(`Right-line took ${performance.measure('right-detect', userstart).duration}`)
                // 2ms
            }

            // NOTE: Could bin-search this but could be inaccurate if there's a line somewhere else
            if (length) {
                const [lx, ly] = (quickLength[userIndex] != undefined) ? 
                    this.followUsernameLine(UN_RIGHT_X-20, user_y_start, imgBuffer, Direction2D.LEFT, Direction2D.DOWN)
                    : [quickLength[userIndex], null];

                // console.log(`Line-follow took ${performance.measure('line-follow', userstart).duration}`)
                // 7ms

                const CHECK_LEFT_SIDE_PX = 4
                const FORWARDS = -12
                const leftEdgeLineMatch = 14
                const MAX_CORNER_BUFFER = 8
                const CORNER_MATCH = 7
                const matchCornerYToX = {}

                // NOTE: The first item is mirrored on the bottom
                // [username_y_offset, x_offset, range]
                const cornerMatchTemplate = {
                    [1]: [8, 2],
                    [2]: [7, 2],
                    [3]: [5, 1],
                    [4]: [4, 1],
                    [5]: [2, 2],
                    [6]: [1, 1],
                    
                    [UN_BOX_HEIGHT-1]: [8, 2],
                    [UN_BOX_HEIGHT-2]: [7, 2],
                    [UN_BOX_HEIGHT-3]: [5, 1],
                    [UN_BOX_HEIGHT-4]: [4, 1],
                    [UN_BOX_HEIGHT-5]: [2, 2],
                    [UN_BOX_HEIGHT-6]: [1, 1],
                }

                leftfind: for (let x_offset=CHECK_LEFT_SIDE_PX; x_offset > FORWARDS; x_offset--) {
                    const x_start = lx + x_offset;
                    let matchesForLine = 0;
                    for (let dy=0; dy < UN_BOX_HEIGHT; dy++) {
                        // TODO: Skip checks if corner buffer already there
                        if (user_y_start+d >= imgBuffer.height) break
                        const leftLine = this.checkLine(x_start, user_y_start+dy, imgBuffer, 1,  Direction2D.RIGHT)
                        if (leftLine) {
                            if (this.debug) imgBuffer.setPixel(x_start, user_y_start+dy, Color.YELLOW)

                            if (!matchCornerYToX[dy] || matchCornerYToX[dy] - x_offset > MAX_CORNER_BUFFER ) {
                                matchCornerYToX[dy] = x_offset
                            
                            }
                            matchesForLine += 1
                        }
                    }
                    // console.log(`Left-line took ${performance.measure('left-find', userstart).duration}`)
                    if (matchesForLine > leftEdgeLineMatch) {
                        // this qualifies as a possible left edge, check for rounded corners
                        const currLineX = x_offset;
                        let cornerMatches = 0
                        for (const crnYPosStr in cornerMatchTemplate) {
                            const crnYPos = parseInt(crnYPosStr)
                            const [crnXPos, crnRange] = cornerMatchTemplate[crnYPosStr]
                            const cornerPxMatch = Math.abs(matchCornerYToX[crnYPos] - (currLineX+crnXPos)) <= crnRange
                            if (cornerPxMatch) cornerMatches += 1
                        }

                        if (cornerMatches > CORNER_MATCH) {
                            // consider this a match, color this up
                            for (const user_y_offset_str in matchCornerYToX) {
                                if (!cornerMatchTemplate[user_y_offset_str]) continue
                                const user_y_offset = parseInt(user_y_offset_str)
                                const x_offset = matchCornerYToX[user_y_offset]
                                const [crn_x_offset, crnRange] = cornerMatchTemplate[user_y_offset]

                                if (this.debug && Math.abs(x_offset - (currLineX+crn_x_offset)) <= crnRange)
                                    imgBuffer.setPixel(lx+x_offset, user_y_start+user_y_offset, Color.HOT_PINK)
                            }
                            if (this.debug)
                                imgBuffer.setPixel(lx+currLineX, user_y_start+20, Color.HOT_PINK)

                            // TODO: Add username length here
                            // userBoxLenList.push(lx+currLineX)
                            userBoxList[userIndex].length = lx+currLineX - UN_RIGHT_X
                            break leftfind;
                        }
                        // console.log(`Left-corner took ${performance.measure('left-corner', userstart).duration}`)
                    }
                }
            }

            // end-while statement
            // user_y_start += UN_BOX_HEIGHT
            // continue // debugging stuff
        }

        // 13ms
        console.log("Finished box detect in "+(performance.measure(startMarkName, startMarkName).duration)+'ms')


        this.bufferSize = this.bufferSize = {w: info.width, h:info.height, channels: info.channels, premultiplied: info.premultiplied, size: info.size }
        this.bufferToFile("testing/line_test/line_testing.png", buffer, false)

        return userBoxList
    }

    /**
     * @param {number} x
     * @param {number} y 
     * @param {ImageBuffer} imgBuffer 
     * @param {Direction2D} line_direction 
     * @param {Direction2D} check_direction
     */
    followUsernameLine(x, y, imgBuffer, line_direction, check_direction) {
        // This seems to be a transparent line of RGB 150,150,150
        // Line below should always be lower than current line

        let linePx = null
        let nonLinePx = null

        let x_offset = x
        let y_offset = y
        let fails = 0
        const MAX_FAILS = 2
        
        while (fails < MAX_FAILS) {

            linePx = imgBuffer.getPixel(x_offset, y_offset)
            nonLinePx = imgBuffer.getPixel(x_offset + check_direction[0], y_offset + check_direction[1])


            if (Color.sumColor(linePx) < Color.sumColor(nonLinePx)) {
                fails += 1
                if (this.debug)
                    imgBuffer.setPixel(x_offset, y_offset, Color.RED)
            } else {
                if (this.debug)
                    imgBuffer.setPixel(x_offset, y_offset, Color.YELLOW)
            }
                
            if (Color.sumColor(linePx)/3 < 145 && linePx[2] < 145) {
                fails += 1
                if (this.debug)
                    imgBuffer.setPixel(x_offset, y_offset, Color.BRIGHT_GREEN)
                // break;
            }

            x_offset += line_direction[0]
            y_offset += line_direction[1]
        }

        return [x_offset, y_offset]
    }

    /**
     * Check if there's a white line in this direction
     * @param {number} x x_coord in image
     * @param {number} y y_coord in image
     * @param {ImageBuffer} imgBuffer
     * @param {number} [size=1] size of line to check
     * @param {Direction2D} [direction] direction to expect cliff
     */
    checkLine(x,y, imgBuffer, size=1, direction=Direction2D.LEFT) {

        const blurPixel = 1;

        const lineTest = []
        for (let i=0; i<size; i++) {
            let [dx, dy] = [direction[0]*-i, direction[1]*-i]
            lineTest.push(imgBuffer.getPixel(x+dx, y+dy))
        }

        // check that pixels are generally white
        const lineAvg = Color.avgPixel(...lineTest)
        const lineDiff = Color.totalDiff(lineAvg)

        const WHITE_BALANCE = 60;
        const WHITE_ENOUGH = 140;

        if (lineDiff/3 > WHITE_BALANCE
            || Color.sumColor(lineAvg) < WHITE_ENOUGH*3) {
            // console.log(`line itself is not balanced white ${lineDiff}`)
            return false;
        }

        const planePixels = []
        for (let i=1; i <= blurPixel; i++) {
            let [dx,dy] = [direction[0]*i, direction[1]*i]
            planePixels.push(imgBuffer.getPixel(x+dx, y+dy))
        }
        const afterAvg = Color.avgPixel(...planePixels)

        // All pixels have been collected, start to test
        // console.log(`before: ${beforeAvg} < line: ${lineAvg} > after: ${afterAvg}`)

        const LINE_DIFF = 26

        return Color.compareWhite(lineAvg, afterAvg) > LINE_DIFF

    }


    /**
     * Verify if chat is on screen
     * @param {ImageBuffer} imgBuffer 
     */
    verifyChatBlockingNames(imgBuffer) {

        // verify chat is on blocking screen by checking the subscribers UI top-right
        // NOTE: WHITE 210 is barely legible, proved that WHITE 220 is

        const chatCheck = {x:1839, y:144, w:28, h:6}
        const cleanMin = 220
        let checkPx = imgBuffer.getPixel(chatCheck.x, chatCheck.y)

        if (Color.sumColor(checkPx)/3 > cleanMin) {
            console.log("Chat on screen")
        } else {
            console.log("Chat not on screen")
        }
        return Color.sumColor(checkPx)/3 > cleanMin;
    }

    /**
     * Turn raw buffer into PNG buffer
     * @param {*} buffer        Buffer that will be converted
     * @param {*} scaleForOCR   Scale buffer up/down for OCR (specific to marbles name)
     * @param {*} toPNG         Turn buffer into PNG
     * @returns 
     */
    bufferToPNG(buffer=this.buffer, scaleForOCR=true, toPNG=true) {
        // let retPromise = null
        let bufferPromise = sharp(buffer, {
            raw: {  width: this.bufferSize.w, 
                    height: this.bufferSize.h, 
                    channels: this.bufferSize.channels, 
                    premultiplied: this.bufferSize.premultiplied}
        })
        if (scaleForOCR) {
            bufferPromise = bufferPromise.resize({width:UserNameBinarization.OCR_WIDTH, kernel:'mitchell'})
                                        .blur(1)
                                        .withMetadata({density: 300})
        }
        
        if (toPNG)
            return bufferPromise.png()
        else
            return bufferPromise
    }

    bufferToFile(filename, buffer=this.buffer, scaleForOCR=true) {
        return this.bufferToPNG(buffer, scaleForOCR).toFile(filename)
    }

}
