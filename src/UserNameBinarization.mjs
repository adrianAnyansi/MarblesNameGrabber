/* 
Modification of the MarblesNameGrabber but changed to work with Node.js
Removes canvas elements and uses sharp instead

*/

import sharp from 'sharp'
import { Buffer } from 'node:buffer'
import { randInt, rotPoint, toPct } from './Mathy.mjs'
import { iterateN, Stopwatch } from "./UtilityModule.mjs"
import { PixelMeasure, Color,
    ImageTemplate, ImageBuffer, Direction2D, SharpImg} from './ImageModule.mjs'
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

        /**  @type {Map<number, number[]>} internal cache of colors, which can be toggled class wide */
        this.cache = new Map();
    }
    
    /**
     * Helper function to import from json object
     * @param {*} jsonObj 
     */
    static Import(jsonObj) {
        let retObj = new ColorSpace(jsonObj.min, jsonObj.max, jsonObj.center, jsonObj.rot)
        return retObj
    }

    static ImportCube(jsonObj) {
        const {l,w,h} = jsonObj.dim
        const {x,y,z} = jsonObj.center
        const center = [x,y,z]

        const min = [-l/2, -w/2,    -h/2]
        const max = [ l/2,  w/2,     h/2]

        return new ColorSpace(min, max, center, jsonObj.matrix)
    }

    static CACHE_ACTIVE = true;

    translatePoint(point) {
        // translation
        const t_point = 
            [this.center[0] - point[0],
            this.center[1] - point[1],
            this.center[2] - point[2]];
        // return t_point

        // rotation
        let r_point = undefined;
        // TODO: If identity matrix, skip this
        // NOTE: This rotation is kills performance, by like a LOT
        r_point = rotPoint(this.rot, t_point)
        return r_point
    }

    /**
     * Checks if sent point is within the colorSpace
     * NOTE: alpha is discarded
     * @param {Array[number]} point 
     * @returns {boolean} if point is within this color space
     */
    check (point) {
        let r_point = undefined;
        // retrieve cache
        if (ColorSpace.CACHE_ACTIVE) {
            const hashColor = Color.toHex(point)
            r_point = this.cache.get(hashColor)
            if (r_point === undefined) {
                r_point = this.translatePoint(point)
                this.cache.set(hashColor, r_point)
            }
        } else {
            r_point = this.translatePoint(point)
        }
        
        for (const idx in this.min) {
            if (r_point[idx] < this.min[idx]) return false
            if (r_point[idx] > this.max[idx]) return false
        }
        return true;
    }

    /**
     * Calculate the dist of a 3D point
     * @returns {number}
     */
    static sqDist (point) {
        return (
            point[0]**2 + point[1]**2 + point[2]**2
        ) ** 0.5
    }

    getPoint(rgba) {
        if (ColorSpace.CACHE_ACTIVE) {
            const hashColor = Color.toHex(rgba)
            return this.cache.get(hashColor)
        } else {
            return this.translatePoint(rgba)
        }
    }

    static distMax = ((255**2) * 3)**0.5
    
    // Load color cube data
    static COLORCUBE_JSON = JSON.parse(fs.readFileSync(resolve("data/colorcube.json"), "utf-8"))

    static COLORS = {
        // SUB_BLUE: ColorSpace.ImportCube(this.COLORCUBE_JSON.SUB_BLUE),
    }
}

// NOTE: Could set up this in the ColorSpace & etc 
// but whatever, its in this module if you use it
for (const color in ColorSpace.COLORCUBE_JSON) {
    ColorSpace.COLORS[color] =  ColorSpace.ImportCube(ColorSpace.COLORCUBE_JSON[color])
}
console.log(`[UsernameBinarization] Imported ${Object.keys(ColorSpace.COLORS).length} colors!`)


// ==========================================
// Utility functions
// ==========================================

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
    userColors[color] = Color.calcMinColorDistance(colorSampling[color])
}

const cacheColorMatch = new Map(Object.values(userColors).map(color => [color, new Map()]))


class UserNameConstant {
    /** @type {number} x_coord where the username ends, before play */
    static PX_BEFORE_PLAY_X = 1652;
    /** @type {number} y_coord where the 1st username begins*/
    static FIRST_TOP_Y = 125;
    /** @type {number} x location of right-side edge line for the username */
    static RIGHT_EDGE_X = 1574+120; // right at 1694

    /** @type {number} height of each username (excluding last one offscreen) */
    static HEIGHT = 40;

    /** @type {number} constant where pixel has been matched */
    static MATCH_FLAG = 0x1;
    /** @type {number} constant where pixel has not been matched */
    static NO_MATCH_FLAG = 0x2;

    /**
     * Helper function to hash coordinate from 
     * @param {number} x 
     * @param {number} y 
     * @returns {number} hash of both coordinates
     */
    static hashCoord (x,y) {
        return x * 2_000 + y
    }
}

/**
 * Class representing a username that's visually on the screen
 * Stores the visual (onscreen) index and information about the username
 */
export class VisualUsername {

    constructor(visual_index, appear, length=undefined) {
        /** @type {number} Visual index on this frame */
        this.vidx = visual_index
        /** @type {boolean} did username appear this frame (rightLine detection) */
        this.appear = appear
        /** 
         * @type {number} length this frame (left edge detection) 
         * if undefined, length was not checked.
         * if null, length checked but not found.
         * if negative, valid value.
        */
        this.length = length
        /** debug object for tracking some things */
        this.debug = {
            /** length matched  */
            matchLen: false,
            /** length checked during unknown length check */
            unknownLen: false,
            /** length checked during OCR */
            ocrLen: false,
            /** length checked during quickLength phase */
            qlLen: false,
        }
    }

    get validLength () {
        return this.length != null
    }

    /**
     * Was length checked and not found this frame
     */
    get lenUnavailable () {
        return this.length === null
    }

    /**
     * Was length checked this frame
     */
    get lenUnchecked () {
        return this.length === undefined
    }
}

// CLASS
/**
 * Main class for cutting and parsing Username iamges from the Marbles UI
 */
export class UserNameBinarization {

    static LINE_DEBUG = false

    /** @type {import('./ImageModule.mjs').RectObj} rectangle for cropped usernames */
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
    /** @deprecated */
    static CHECK_LINES = [
        3, 5, 7, 9, 11,12, 14, 15, 16, 20, 22, 24, 28, 30, 32
    ]
    /** @deprecated Lines to ignore (check for non letter colours) to indicate end of line */ 
    static ANTI_LINES = [
        2, 37
    ]
    
    DEBUG_NAME_RAW_FILE    = 'testing/name_crop.png'
    DEBUG_NAME_RECOGN_FILE = 'testing/name_match.png'
    DEBUG_NAME_BIN_FILE     = 'testing/name_bin.png'

    constructor(imageLike=null, debug=false) {
        // Get references, etc
        /** @type {import('./ImageModule.mjs').ImageLike} image being read */
        this.imageLike = imageLike
        /** @type {SharpImg} original Sharp image without cropping */
        this.sharpImg = new SharpImg(imageLike);

        /** @type {import('./ImageModule.mjs').RectBounds} {w,h} for rect of original image */
        this.imageSize = null
        /** @type {Buffer} buffer used to write the orig buffer before edits because PROD makes little edits, only DEBUG makes a full-copy at isolateUserNames */
        this.orig_buffer = null
        /** @type {Buffer} cropped buffer of raw name pixel data */
        this.buffer = null
        /** @type {Buffer} binarized buffer of black text on a white background */
        this.binBuffer = null
        /** @type {import('./ImageModule.mjs').RectBounds} {w,h} for rect of the cropped image */
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
     * @deprecated
     */
    async dumpInternalBuffer () {
        return {
            buffer:      this.buffer,
            imgMetadata: this.imageSize,
            info:        this.bufferSize
        }
    }

    /**
     * Performs the large task of separating background from names & isolating thresholds to
     * create a binarized image for OCR.
     * @returns Binarized PNG image
     * @deprecated
     */
    async isolateUserNames () {

        /*
        Logic, using the offset and box size.
        Look from right->left. Multiple passes
            1. Move right to left with the dot check, mark for flood-fill
            2. When reaching 4 vertical lines without userColor, exit
            3. Flood-fill to black respecting intensity, copy to new imgData

        Initution: Simply move from right->left looking for a big color gap
            Ignore anything that matches BLACK or user colors
        */
    
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
            /** @type {Color} first matched color in range */
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
                            if (this.debug) this.setPixel(x_start, y_start+check_px_off, Color.LIME)
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
    /**
     * @deprecated old floodfill
     */
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
    /**
     * @deprecated
     */
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

    // ======================= UN Tracker binarization =========================


    /**
     * Helper function that crops out a username image for later use
     * @param {number} idx [0-23] index currently on screen
     * @param {number} negativeLen negative int showing the length from 
     * @returns {Promise<SharpImg>} cropped username
     */
    async cropTrackedUserName(idx, negativeLen) {
        // const newSharp = new SharpImg(this.imageLike)
        // There are race conditions if I reuse this.sharpImg with extract, instead 
        // I'll just recreate the sharp (since buffer is not needed) and leave a comment

        const UN_ENTRY_PADDING = UserNameConstant.RIGHT_EDGE_X - UserNameConstant.PX_BEFORE_PLAY_X;
        const UN_Y = UserNameConstant.FIRST_TOP_Y + idx * UserNameConstant.HEIGHT

        const cropRect = {
            x: UserNameConstant.RIGHT_EDGE_X + negativeLen,
            y: UN_Y,
            h: UserNameConstant.HEIGHT,
            w: -1*negativeLen - UN_ENTRY_PADDING,
        }
        if (cropRect.w < 0)
            throw Error("Why is cropRect negative here")
        return this.sharpImg.crop(cropRect)
    }


    /**
     * Using a cropped sharp image, binarizes and returns a png buffer with a valid image.
     * Can accept multiple images to overlay.
     * Do not send index 23 into this if possible
     * @param {SharpImg[]} sharpImgs 
     * @returns {Promise<ImageBuffer>} raw image buffer
     */
    async binTrackedUserName(sharpImgs) {

        // const binMarkName = 'bin-idv-user-start'
        // TODO: Merge multiple images, just using first one rn
        const baseBuffer = await sharpImgs[0].buildBuffer()
        // performance.mark(binMarkName)
        const bin_sw = new Stopwatch()

        const imgBuffer = baseBuffer
        const binBuffer = baseBuffer.cloneDims()
        /** @type {Map<number, number>} Check when pixel has been visited on not */
        const pxVisitMap = new Map();

        /** @type {ColorSpace[]} list of all available color spaces  */
        const COLOR_TEST = Object.values(ColorSpace.COLORS);

        /** @type {ColorSpace} Detected colorspace for current username */
        let currColorSpace = undefined; // note saved 10ms cause it was in for-loop

        const USER_Y_BUFFER = 6 // buffer to ignore white outside lines
        const UN_LEFT_BUFFER = 8 // better to ignore from the left
        const UN_RIGHT_BUFFER = 3

        // iterate from right to left across the image. Ignore 5 pixels from left
        for (let x_coord=imgBuffer.width-UN_RIGHT_BUFFER; 
                x_coord > UN_LEFT_BUFFER; x_coord--) {
            for (let y_coord = USER_Y_BUFFER; y_coord < imgBuffer.height-USER_Y_BUFFER; y_coord++ ) {

                if (pxVisitMap.get(UserNameConstant.hashCoord(x_coord,y_coord)) !== undefined) continue;
                const px_rgb = imgBuffer.getPixel(x_coord, y_coord)

                // check if any colors match
                let colorMatch = false;
                if (currColorSpace) {   // test against this color
                    colorMatch = currColorSpace.check(px_rgb)
                } else {    // test against all colors
                    currColorSpace = COLOR_TEST.find(cs => cs.check(px_rgb))
                    if (currColorSpace) colorMatch = true
                }

                // do a flood-fill against this color
                if (colorMatch) {
                    this.floodFillTracked(x_coord, y_coord,
                        imgBuffer, binBuffer, currColorSpace,
                        pxVisitMap
                    )
                } 
                // else if (this.debug) // set color if pixel checked but no match
                //     imgBuffer.setPixel(x_coord, y_coord, Color.HOT_PINK)

            }
        }
        
        if (this.debug) {   // write buffer when complete
            console.log(`Bin completed in ${bin_sw.stop()}`)
            new SharpImg(null, imgBuffer).toSharp({toPNG:true}).toFile('testing/indv_user_bin_color.png')
            new SharpImg(null, binBuffer).toSharp({toPNG:true}).toFile('testing/indv_user_bin.png')
        }

        return binBuffer
    }

    /**
     * Flood-fill an color from the TrackedUsername image
     * @param {number} x x coordinate
     * @param {number} y y coordinate
     * @param {ImageBuffer} imgBuffer Expect buffer to be edited during iteration
     * @param {ImageBuffer} binBuffer Buffer containing the B&W result
     * @param {ColorSpace} colorSpace Matching colorSpace to check against
     * @param {Map<number, number>} pxVisitMap Map to track visited pixels
     * @param {number} expand Continue N pixels past a successful match
     */
    floodFillTracked(x,y, imgBuffer, binBuffer, colorSpace, pxVisitMap, expand=3) {
        let px_visited = 0

        /** @type {Array[number[]]} */
        const floodFillQueue = [] // [x,y,exp] Queue for the floodFill checks
        
        const offsetCoord = [[0,1], [1,1], [1,0], [1,-1], [0,-1], [-1,-1], [-1,0], [-1,1]]
        floodFillQueue.push(...offsetCoord.map( ([tx,ty]) => [x+tx, y+ty, expand]))

        // Set initial match
        binBuffer.setPixel(x,y, Color.BLACK)
        pxVisitMap.set(UserNameConstant.hashCoord(x,y), UserNameConstant.MATCH_FLAG)
        if (this.debug)
            imgBuffer.setPixel(x,y, Color.RED)

        while (floodFillQueue.length > 0) {
            const [cx, cy, expand] = floodFillQueue.pop(0)
            if (cx < 0 || cy < 0) continue;
            if (cx >= imgBuffer.width || cy >= imgBuffer.height) continue;

            const coordHash = UserNameConstant.hashCoord(cx, cy)
            if (pxVisitMap.get(coordHash) !== undefined) continue; //visited

            px_visited += 1;

            const px_rgb = imgBuffer.getPixel(cx, cy)
            const matchColorSpaceBool = colorSpace.check(px_rgb);
            
            // calculate the fall-off based on range
            const chOffset = 1 - (ColorSpace.sqDist(colorSpace.getPoint(px_rgb)) / ColorSpace.distMax);
            const EXP_FALLOFF = 3 + (matchColorSpaceBool ? 1 : 3)
            const avgRatio = (chOffset ** EXP_FALLOFF)
            const avgCh = Math.round((1-avgRatio) * 0xFF) // invert cause BLACK is 0
            const bw_rgb = [avgCh, avgCh, avgCh];

            binBuffer.setPixel(cx, cy, bw_rgb)
            
            if (this.debug) {
                imgBuffer.setPixel(cx, cy, 
                    matchColorSpaceBool ? Color.MAHOGANY : Color.MAHOGANY_DARK
                )
            }
            pxVisitMap.set(coordHash, 
                matchColorSpaceBool ? UserNameConstant.MATCH_FLAG : UserNameConstant.NO_MATCH_FLAG)

            if (expand > 0 || matchColorSpaceBool ) { // queue adjacent squares
                const nextExpand = matchColorSpaceBool ? expand : expand - 1
                floodFillQueue.push( ...offsetCoord.map( ([tx,ty]) => [cx+tx, cy+ty, nextExpand]) )
            }
        }
        
        return px_visited
    }


    // ==============================================================================
    // Template and other image matching
    // ==============================================================================
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
     * @param {import('./ImageModule.mjs').RectObj} rectObj
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
        const croppedImg = this.sharpImg.crop(rectObj)

        /** @type {[ImageBuffer, ImageBuffer]} cropped and imageTemplate buffers */
        const [cropImgBuffer, imgBuffer] = await Promise.all([croppedImg.buildBuffer(),
            imgTemplate.sharpImg.buildBuffer()
        ])

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

            const [x, y] = imgBuffer.toCoord(currPx)
            const rgba = imgBuffer.getPixel(x,y);
            
            if (rgba[3] < ALPHA_THRESHOLD) {
                imgPxTotal -= 1; // ignore pixel from total
            } else {
                checkedPxTotal += 1;
                const c_rgba = cropImgBuffer.getPixel(x, y)

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
        // console.debug(`Compare pct failed  ${imgTemplate.name}: ${toPct(pxMatchCount / checkedPxTotal)}`)
        return false;
    }

    async validateMarblesPreRaceScreen() {
        const generic_buffer = 0.05;

        return (
            await this.checkImageAtLocation(
                UserNameBinarization.START_BUTTON_TEMPLATE, 0.85-generic_buffer)
            ||
            await this.checkImageAtLocation(
                UserNameBinarization.PRE_RACE_START_W_DOTS_TEMPLATE, 0.90-generic_buffer)
            ||
            await this.checkImageAtLocation(
                UserNameBinarization.GAME_SETUP_TEMPLATE, 0.9-generic_buffer)
            ||
            await this.checkImageAtLocation(
                UserNameBinarization.SUBSCRIBERS_TEMPLATE, 0.9-generic_buffer)
        )
    }

    /**
     * Search image for white username bounding box at locations
     * @param {Map<number, VisualUsername>} usersToCheck check slots [0-23]. Empty list is 0-23, ignore exceptions
     * @param {Object} checkDetails 
     * @param {boolean} [checkDetails.appear=true] check that this user exists (right line)
     * @param {boolean} [checkDetails.length=true] check the length of the user
     * @param {Map<number, number>} [checkDetails.quickLength] check length at x_coord
     * 
     * @returns {Promise<Map<number,VisualUsername>>} retObj, sparse* array {appear:bool, length:number, quickLen:bool}
     */
    async getUNBoundingBox(usersToCheck=null, {appear=true, length=true, quickLength=new Map()}) {

        let un_bound_box = null
        if (this.debug)
            un_bound_box = new Stopwatch()
        
        const imgBuffer = await this.sharpImg.buildBuffer();
        
        if (this.debug)
            console.log(`Buffer wait took: ${Stopwatch.msToHUnits(un_bound_box.read(), false)}`)

        const UN_TOP_Y = UserNameConstant.FIRST_TOP_Y;
        const UN_RIGHT_X = UserNameConstant.RIGHT_EDGE_X;
        const UN_BOX_HEIGHT = UserNameConstant.HEIGHT;
        
        if (!usersToCheck || usersToCheck.size == 0) {
            usersToCheck = usersToCheck ?? new Map();
            for (const idx of iterateN(24))
                usersToCheck.set(idx, new VisualUsername(idx))
        } else {
            // NOTE ineffient check+set but its alr
            for (const [idx, vUser] of usersToCheck) {
                if (!vUser) usersToCheck.set(idx, new VisualUsername(idx));
            }
        }

        for (const [userIndex, visualUser] of usersToCheck.entries()) {

            const user_y_start = UN_TOP_Y + UN_BOX_HEIGHT * userIndex

            const user_perf_sw = new Stopwatch()
            const userQLCheck = quickLength && quickLength.get(userIndex)
            const IsUserIndex23 = userIndex == 23

            // check the right side wall
            if (appear) {
                const APPEAR_MIN = 15
                // TODO: during exitingState, this can trigger on the A of Play (edge-case)
                // detect the top/bottom lines to verify this as well
                let right_match = 0
                for (let d=UN_BOX_HEIGHT/4; d < UN_BOX_HEIGHT * 3/4; d++) {
                    if (IsUserIndex23 && user_y_start+d >= imgBuffer.height) break
                    
                    // const rightLine = this.checkLine(UN_RIGHT_X, user_y_start+d, imgBuffer, 1, Direction2D.LEFT)
                    const rightLine = this.checkLineThres(UN_RIGHT_X, user_y_start+d, imgBuffer, 1, Direction2D.LEFT)
                    // continue;
                    // if (rightLine != rightLine2) {
                    //     console.warn('diff ', rightLine, rightLine2)
                    //     imgBuffer.setPixel(UN_RIGHT_X, user_y_start+d, Color.GREEN)
                    // }
                    if (rightLine) {
                        right_match++
                        if (this.debug) imgBuffer.setPixel(UN_RIGHT_X, user_y_start+d, Color.RED)    
                        if (right_match > APPEAR_MIN) break;
                    }
                }
                
                visualUser.appear = (right_match > APPEAR_MIN) // update value in userList
                if (this.debug)
                    console.log(`Appear detect took #${userIndex} ${user_perf_sw.time}`)
                // <0.05ms
            }

            // Check length at this specific position only.
            // If the length check fails, length will remain on its previous value
            if (userQLCheck) {
                const MATCH_MIN = !IsUserIndex23 ? 15 : 7;
                const x_px_to_check = userQLCheck + UN_RIGHT_X
                let left_match_pixels = 0;

                qlRolling: for (const d of iterateN(UN_BOX_HEIGHT * 0.75, UN_BOX_HEIGHT * 0.25)) {
                    if (IsUserIndex23 && user_y_start+d >= imgBuffer.height) break;

                    const testCoord = [x_px_to_check, user_y_start+d]
                    const leftLineCheck = this.checkLineThres(...testCoord, imgBuffer, 1, Direction2D.RIGHT)

                    if (leftLineCheck) {
                        if (this.debug) imgBuffer.setPixel(...testCoord, Color.LIME)
                        if (left_match_pixels++ > MATCH_MIN) {

                            // Perform the corner check
                            const pixelRange = [-6, 0]
                            const y_px_to_check = user_y_start + UserNameConstant.HEIGHT * 0.1;
                            for (const iter of iterateN(...pixelRange)) {
                                const ulpoint = [x_px_to_check + Direction2D.LEFT[0] * iter, y_px_to_check]
                                const ulCornerCheck = this.checkLineThres(...ulpoint, imgBuffer, 1, Direction2D.RIGHT)
                                if (ulCornerCheck && ulpoint[1] < x_px_to_check) {
                                    if (this.debug)
                                        imgBuffer.setPixel(...ulpoint, Color.HOT_PINK)
                                    visualUser.length = x_px_to_check - UN_RIGHT_X; // set early and quit
                                    break qlRolling;
                                }
                            }

                            // visualUser.length = x_px_to_check - UN_RIGHT_X; // set early and quit
                            // break;
                        }
                    }
                }
                
                if (this.debug)
                    console.log(`Quick left-line detect took #${userIndex} ${user_perf_sw.time}`)
            }

            if (length && visualUser.lenUnchecked) {

                // NOTE: Could bin-search this but could be inaccurate if there's a line somewhere else
                const [lx, _ly] = this.followUsernameLine(
                    UN_RIGHT_X-20, user_y_start, imgBuffer, Direction2D.LEFT, Direction2D.DOWN);

                if (this.debug) // can take anywhere to 0.15ms to 0.5ms
                    console.log(`Line follow detect took #${userIndex} ${user_perf_sw.time}`)

                const [X_RIGHT_START, X_LEFT_END] = [-2, -9];
                const min_t = !IsUserIndex23 ? 10 : 6;
                // const SAMPLE_SLICE = UN_BOX_HEIGHT*0.6/test_lines // Trunc this to prevent overlap

                for (const x_offset of iterateN(X_LEFT_END, X_RIGHT_START)) {
                    const x_line = lx + x_offset;
                    let matchesThisLine = 0;
                    
                    for (const dy of iterateN(UN_BOX_HEIGHT*0.25, UN_BOX_HEIGHT*0.75)) {
                        const testPoint = [x_line, user_y_start+dy]
                        if (IsUserIndex23 && testPoint[1] >= imgBuffer.height) break
                        const leftLine = this.checkLineThres(...testPoint, imgBuffer, 1,  Direction2D.RIGHT, 2)
                        if (leftLine) matchesThisLine += 1
                        if (this.debug && leftLine) imgBuffer.setPixel(...testPoint, Color.YELLOW)
                    }
                    if (matchesThisLine > min_t) {
                        if (this.debug)
                            console.log(`Pass Left edge detect took #${userIndex} ${user_perf_sw.time}`)
                        
                        if (this.debug)
                            imgBuffer.setPixel(x_line, user_y_start+21, Color.LIME)
                        // left edge, now check corner matches
                        const foundCorners = [10_000, 20_000]
                        const pixelCheck = 12
                        
                        const dirs = [Direction2D.LEFT, Direction2D.LEFT]
                        const [u_l_st, u_l_end] = [user_y_start+UN_BOX_HEIGHT*0.1, 
                            user_y_start+UN_BOX_HEIGHT*0.9]

                        for (const iter of iterateN(pixelCheck, -2)) {
                            const ulpoint = [lx + dirs[0][0] * iter, u_l_st + dirs[0][1] * iter]
                            const ulCorner = this.checkLineThres(...ulpoint, imgBuffer, 1, Direction2D.RIGHT)
                            if (ulCorner) foundCorners[0] = lx
                            const dlPoint = [lx + dirs[1][0] * iter, u_l_end + dirs[1][1] * iter]
                            const dlCorner = (!IsUserIndex23) 
                                ? this.checkLineThres(...dlPoint, imgBuffer, 1, Direction2D.RIGHT)
                                : true
                            if (dlCorner) foundCorners[1] = lx

                            if (Math.abs(foundCorners[0] - foundCorners[1]) <= 2) {
                                if (this.debug) {
                                    if (!IsUserIndex23) imgBuffer.setPixel(...dlPoint, Color.LIME)
                                    imgBuffer.setPixel(...ulpoint, Color.LIME)
                                }
                                break
                            } else {
                                // if (!IsUserIndex23) imgBuffer.setPixel(...dlPoint, Color.MAHOGANY)
                                //     imgBuffer.setPixel(...ulpoint, Color.MAHOGANY)
                            }
                        }
                        if (this.debug)
                            console.log(`Finish corner detect #${userIndex} took ${user_perf_sw.time}`)
                        
                        if (Math.abs(foundCorners[0] - foundCorners[1]) <= 2) {
                            visualUser.length = x_line - UN_RIGHT_X
                            if (this.debug)
                            imgBuffer.setPixel(x_line, user_y_start+20, Color.RED)
                        }  
                        break
                    }
                    if (this.debug)
                        console.log(`Miss Left box detect took #${userIndex} ${user_perf_sw.time}`)
                }
                if (!visualUser.length)
                    visualUser.length = null
                if (this.debug)
                    console.log(`Length detect took #${userIndex} ${user_perf_sw.time}`)
            } // userbox if-length check

            if (false && length && !userQLCheck) {
                if (visualUser.lenUnavailable) continue;

                // NOTE: Could bin-search this but could be inaccurate if there's a line somewhere else
                const [lx, _ly] = this.followUsernameLine(
                        UN_RIGHT_X-20, user_y_start, imgBuffer, Direction2D.LEFT, Direction2D.DOWN);

                if (this.debug)
                    console.log(`Line follow detect took #${userIndex} ${user_perf_sw.time}`)
                // console.log(`Line-follow took ${performance.measure('line-follow', userstart).duration}`)
                // 7ms

                // Verify that rounded outline exists to increase the accuracy

                /** Pixels to RIGHT to start checking from top-edge match */
                const CHECK_FROM_RIGHT_X = 2
                /** Pixels to LEFT to end checking from top-edge match */
                const CHECK_TO_LEFT_X = -11
                /** Pixels required to match left edge box */
                const leftEdgeLineMatch = 12
                /** When iterating from right->left, keep & skip line matches from N pixels back */
                const MAX_CORNER_BUFFER = 4
                // Because index 23 only contains top corner, require only half match num
                /** Pixels required to match rounded corners of box */
                const CORNER_MATCH = userIndex == 23 ? 3 : 6

                const matchCornerYToX = new Map()

                // NOTE: The first item is mirrored on the bottom, do this programmatically
                // TODO: Tweak this with actual math & testing
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
                

                leftfind: for (let x_offset=CHECK_FROM_RIGHT_X; x_offset > CHECK_TO_LEFT_X; x_offset--) {
                    const x_start = lx + x_offset;
                    let matchesForLine = 0;
                    for (let dy=0; dy < UN_BOX_HEIGHT; dy++) {
                        // TODO: Skip checks if corner buffer already there
                        if (user_y_start+dy >= imgBuffer.height) break
                        const testPoint = [x_start, user_y_start+dy]
                        const leftLine = this.checkLineThres(...testPoint, imgBuffer, 1,  Direction2D.RIGHT)
                        // if (leftLine != leftLine2) {
                        //     console.warn('left diff ', leftLine, leftLine2)
                        //     imgBuffer.setPixel(...testPoint, Color.GREEN)
                        // }
                        if (leftLine) {
                            if (this.debug) imgBuffer.setPixel(...testPoint, Color.YELLOW)

                            const Ypx = matchCornerYToX.get(dy)
                            if (!Ypx || Ypx - x_offset > MAX_CORNER_BUFFER ) {
                                matchCornerYToX.set(dy, x_offset)
                            }
                            matchesForLine += 1
                        }
                    }
                    if (this.debug)
                        console.log(`Left edge ${matchesForLine} find detect took #${userIndex} ${user_perf_sw.time}`)

                    if (matchesForLine > leftEdgeLineMatch) {
                        // this qualifies as a possible left edge, check for rounded corners
                        const currLineX = x_offset;
                        let cornerMatches = 0
                        for (const crnYPosStr in cornerMatchTemplate) {
                            const crnYPos = parseInt(crnYPosStr)
                            const [crnXPos, crnRange] = cornerMatchTemplate[crnYPosStr]
                            const cornerPxMatch = Math.abs(matchCornerYToX.get(crnYPos) - (currLineX+crnXPos)) <= crnRange
                            if (cornerPxMatch) cornerMatches += 1
                        }

                        if (cornerMatches >= CORNER_MATCH) {
                            // consider this a match and solve
                            visualUser.length = lx+currLineX - UN_RIGHT_X
                            if (!this.debug)
                                break leftfind;

                            // If debug, consider this a match, color this up
                            for (const [user_y_offset, x_offset] of matchCornerYToX.entries()) {
                                if (!cornerMatchTemplate[user_y_offset]) continue
                                // const user_y_offset = parseInt(user_y_offset)
                                // const x_offset = matchCornerYToX.get(user_y_offset)
                                const [crn_x_offset, crnRange] = cornerMatchTemplate[user_y_offset]

                                if (this.debug && Math.abs(x_offset - (currLineX+crn_x_offset)) <= crnRange)
                                    imgBuffer.setPixel(lx+x_offset, user_y_start+user_y_offset, Color.HOT_PINK)
                            }
                            if (this.debug)
                                imgBuffer.setPixel(lx+currLineX, user_y_start+20, Color.RED)

                        }
                        if (this.debug)
                            console.log(`Left box detect took #${userIndex} ${user_perf_sw.time}`)
                    }
                }
                if (!visualUser.length)
                    visualUser.length = null
                // if (userBoxList[userIndex].length == undefined) 
                //     userBoxList[userIndex].length = null
            } // userbox if-length check

            if (this.debug)
                console.log(`User check took took #${userIndex} ${user_perf_sw.time}`)
        } // per user check

        // 13ms
        if (this.debug) {
            console.log(`Finished UN box detection in ${un_bound_box.time}`)
            this.sharpImg.toSharp({toPNG:true}).toFile("testing/line_testing.png")
        }

        return usersToCheck
    }

    /**
     * Seems to be a transparent line of RGB [150,150,150]
     * Line below should always be lower than current line
     * 
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
                    imgBuffer.setPixel(x_offset, y_offset, Color.LIME)
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
     * @deprecated checkLineThres is more accurate*
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
        const lineDiff = Color.sumDiff(lineAvg)

        const WHITE_BALANCE = 70;
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

        return Color.sumColor(Color.diff(lineAvg, afterAvg)) > LINE_DIFF
        // return Color.compareWhite(lineAvg, afterAvg) > LINE_DIFF

    }

    /**
     * Check if there's a white line in this direction
     * This logic has been edited to estimate the line
     * @param {number} x x_coord in image
     * @param {number} y y_coord in image
     * @param {ImageBuffer} imgBuffer
     * @param {number} [size=1] size of line to check
     * @param {Direction2D} [direction] direction to expect cliff
     */
    checkLineThres (x,y,imgBuffer, size=1, direction=Direction2D.LEFT, skip_px=2) {

        const blurPixel = 1; // How many pixels to check for plane
        const PX_DIFF = 150 // Expected 
        const DIFF_TO_LINE = 72; 
        // This isn't consistent, reducing this but need the cliff
        const DIFF_TO_MAX = 30;
        const BG_CH_MAX = 180; // background max channel color

        const lineTest = []
        for (let i=0; i<size; i++) {
            const [dx, dy] = [direction[0]*-i, direction[1]*-i]
            lineTest.push(imgBuffer.getPixel(x+dx, y+dy))
            // if (UserNameBinarization.LINE_DEBUG)
            //     imgBuffer.setPixel(x+dx, y+dy, Color.RED)
        }

        // NOTE: Skipping to 2 pixels here
        const planePixels = []
        for (let i=skip_px; i < skip_px+blurPixel; i++) {
            const [dx,dy] = [direction[0]*i, direction[1]*i]
            planePixels.push(imgBuffer.getPixel(x+dx, y+dy))
            // if (UserNameBinarization.LINE_DEBUG)
            //     imgBuffer.setPixel(x+dx, y+dy, Color.ORANGE)
        }

        // Plane should always be darker due to background opacity
        if (!(Color.sumColor(planePixels.at(-1)) <= BG_CH_MAX*3)) {
            if (UserNameBinarization.LINE_DEBUG)
                console.log("Fail line check, above dark threshold")
            
            // const [dx,dy] = [direction[0]*2, direction[1]*2]
            // imgBuffer.setPixel(x+dx, y+dy, Color.BLUE)
            return false
        }

        // expect a difference of around 180
        const diffPx = Color.diff(lineTest[0], planePixels.at(-1))
        if (Color.sumColor(diffPx) / 3 > DIFF_TO_LINE) return true
        
        // NOTE: calculate the max color, as color can cap
        const maxColor = Color.add(planePixels.at(-1), [PX_DIFF, PX_DIFF, PX_DIFF])
        const diffToExpected = Color.abs(Color.diff(maxColor, planePixels.at(-1)))
        if (UserNameBinarization.LINE_DEBUG)
            console.log(`Diff is ${diffPx} : ${maxColor} ~ ${lineTest[0]} but ${planePixels.at(-1)}`)
        if(Color.sumColor(diffToExpected) / 3 < DIFF_TO_MAX) return true

        return false
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

        if (this.debug) {
            if (Color.sumColor(checkPx)/3 < cleanMin) {
                console.log("Chat on screen")
            } else {
                console.log("Chat not on screen")
            }
        }
        return Color.sumColor(checkPx)/3 < cleanMin;
    }

}
