/* 
Modification of the MarblesNameGrabber but changed to work with Node.js
Removes canvas elements and uses sharp instead

*/

import sharp from 'sharp'
import { Buffer } from 'node:buffer'

const MEASURE_RECT = { x: 0, y:0, w: 1920, h: 1080} // All values were measured against 1080p video
const NAME_RECT = {
    x: 957/1920,
    y: 152/1080,
    w: (1504-957)/1920,
    h: (1080-154)/1080
}

function hashArr(arr) {
    return `${arr?.[0]},${arr?.[1]},${arr?.[2]}`
}

function toHex(rgba) {
    return (rgba[0] << 8*2) + (rgba[1] << 8*1) + rgba[2]
}

function toRGBA (hexColor, alpha=0xFF) {
    const mask = 0xFF
    return new Uint8Array([(hexColor >> 8*2) & mask,
            (hexColor >> 8*1) & mask, 
            hexColor & mask,
            alpha])
}

// https://stackoverflow.com/questions/4754506/color-similarity-distance-in-rgba-color-space
// NOTE: SO on pre-multiplied alpha, but note my colours are all 100% alpha
function redmean (rgba, rgba2) {
    // https://en.wikipedia.org/wiki/Color_difference
    // Referenced from here: https://www.compuphase.com/cmetric.htm
    // Range should be ~255*3
    const redmean = 0.5 * (rgba[0]+rgba2[0])

    const redComp   = (2+redmean/256)       * (rgba[0]-rgba2[0])** 2
    const greenComp =   4                   * (rgba[1]-rgba2[1])** 2
    const blueComp  =  (2+(255-redmean)/256) * (rgba[2]-rgba2[2])** 2

    return Math.sqrt(redComp+greenComp+blueComp)
}

function sqrColorDistance (rgba, rgba2) {
    let ans = 0
    for (let idx in rgba)
        ans += (rgba[0]-rgba2[0]) ** 2
    return ans
}

function calcMinColorDistance (colorList) {
    // binary search across each color channel
    const redRange = [0, 255]
    const blueRange = [0,255]
    const greenRange = [0,255]

    const ranges = [redRange, blueRange, greenRange]
    const midOfRange = range => parseInt((range[1] - range[0])/2) + range[0]

    const RGBA_LIST = colorList.map( c => toRGBA(c))
1
    while (ranges.some(range => range[0] < range[1])) {
        
        for (let idx in ranges) {
            const range = ranges[idx]
            if (range[0] >= range[1]) continue
            // let mid = parseInt((range[1] - range[0])/2) + range[0]
            let rgbaTest = [midOfRange(ranges[0]), midOfRange(ranges[1]), midOfRange(ranges[2])]
            let maxColorDist = Math.max(...RGBA_LIST.map( rgbaC => redmean(rgbaTest, rgbaC)))

            rgbaTest[idx] = (rgbaTest[idx]+1) % 255
            let maxRightColorDist = Math.max(...RGBA_LIST.map( rgbaC => redmean(rgbaTest, rgbaC)))

            rgbaTest[idx] = Math.max((rgbaTest[idx]-2), 0)
            let maxLeftColorDist = Math.max(...RGBA_LIST.map( rgbaC => redmean(rgbaTest, rgbaC)))

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

    return [retRGBA, Math.max(...RGBA_LIST.map( c => redmean(retRGBA, c)))]
}

const colorSampling = {
    SUB_BLUE: [0x7b96dc, 0x6c97f5, 0x7495fa, 0x7495fa, 0x8789ec, 0x7294ec, 0x7298e6, 0x799aff, 0x7b95f7, 0x7897fa,
                0x846ed9, 0x577ac9, 0x809ae7, 0x8e95d4, toHex([87, 164, 255]), toHex([158, 180, 251]), toHex([111, 128, 209])],
    UNSUB_WHITE: [0xfffefb, 0xc9c2c0, 0xc3bdba, 0xfef8f5, 0xfcf6f3, 0xd0c9c7, 0xcfc8c5, 0xece5e2, 0xd1cbc8, 0xbdbdb9, 
                    0xFFFEFF, 0xFFFFFF, 0xE5E5E7, 0xFFFFFD, 0xFFFAF7]
    // TEST:       [0x000000, 0x101010, 0x040404]
}


// Setting some default colours  
const BLACK           = 0x000000
const DARKGRAY        = 0x555555
const WHITE           = 0xFFFFFF
const YELLOW          = 0xFFFF00
const ORANGE          = 0xFFA500
const MAHOGANY        = 0xC04000
const RED             = 0xFF0000

const SUB_BLUE        = 0x7b96dc
const MOD_GREEN       = 0x00FF00
const VIP_PINK        = 0xFF00FF

const MATCH_ALPHA = 0xFE
const NO_MATCH_ALPHA = 0xFD
const ANTI_MATCH_ALPHA = 0xFC


const userColors = {}
for (let color in colorSampling) {
    userColors[color] = calcMinColorDistance(colorSampling[color])
}

const cacheColorMatch = new Map(Object.values(userColors).map(color => [color, new Map()]))

// CLASS

export class MarbleNameGrabberNode {

    nameRect = {
        x: 957/1920,
        y: 152/1080,
        w: (1504-957)/1920, // NOTE: Could increase padding here
        h: (1070-152)/1080
    }
    
    DEBUG_NAME_RAW_FILE    = 'testing/name_crop.png'
    DEBUG_NAME_RECOGN_FILE = 'testing/name_match.png'
    DEBUG_NAME_BIN_FILE     = 'testing/name_bin.png'

    constructor(imageLike=null, debug=false, imgOptions={}) {
        // Get references, etc

        this.imageLike = imageLike // image being read
        // this.imageOptions = {raw: {  width: this.bufferSize.w, 
        //     height: this.bufferSize.h, 
        //     channels: this.bufferSize.channels, 
        //     premultiplied: this.bufferSize.premultiplied
        // }}
        this.imageSize = null   // {w,h} for rect of original image

        this.buffer = null      // buffer of raw pixel data
        this.binBuffer = null   // binarized buffer of black text on a white background
        this.bufferPromise = null   // promise that is resolved when buffer has been set
        this.bufferSize = null      // {w,h} for rect of the cropped image

        // debug will write intermediate to file for debugging
        this.debug = debug

    }

    async buildBuffer () {
        // Build sharp object and extract buffer as UInt8Array
        
        let sharpImg = sharp(this.imageLike)
        this.buffer = null // delete previous buffer
        this.bufferSize = null
        this.imageSize = null

        this.bufferPromise = sharpImg.metadata()
            .then( imgMetadata => {
                // console.debug("Got metadata")
                this.imageSize = {w: imgMetadata.width, h: imgMetadata.height}
                let normNameRect = this.normalizeRect(this.nameRect, imgMetadata.width, imgMetadata.height)
                let sharpImgCrop = sharpImg.extract({left: normNameRect.x, top: normNameRect.y,
                        width: normNameRect.w, height: normNameRect.h })
                
                return sharpImgCrop.raw().toBuffer({ resolveWithObject: true })
            })
            .then( ({data, info}) => {
                if (data) {
                    this.bufferSize = {w: info.width, h:info.height, channels: info.channels, premultiplied: info.premultiplied, size: info.size }
                    this.buffer = data
                    this.binBuffer = Buffer.alloc(info.size, new Uint8Array(toRGBA(WHITE)))
                }
                return Promise.resolve(data)
            })
            .catch( err => {
                console.warn(`Did not get buffer Error:${err}`)
                throw err
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
        let pixel_offset = (y_coord * this.bufferSize.w + x_coord) * this.bufferSize.channels;
        return pixel_offset
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

    // percent of 1080p height
    USERNAME_BOX_HEIGHT_PCT  = ((185+1) - 152) / MEASURE_RECT.h;
    CHECK_LINES_PCT = [
        (160 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (161 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (162 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (166 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (170 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (173 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (176 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (177 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (179 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
    ]
    ANTI_LINES_PCT = [
        (154 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (156 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        // (181 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
        (182 - this.nameRect.y * MEASURE_RECT.h) / MEASURE_RECT.h,
    ]
    USERNAME_LEFT_PADDING_PCT = 10 / MEASURE_RECT.w // Left padding in pixels @ 1920
    USERNAME_RIGHT_MIN_PCT = 40 / MEASURE_RECT.w // Approx 3 alphanum chars @ 1920

    async isolateUserNames () {
        // First, ensure buffer exists

        // TODO: Rewrite this to be better
        if (this.bufferPromise)
            await this.bufferPromise
        else
            await this.buildBuffer()

        if (this.debug) await this.bufferToFile(this.DEBUG_NAME_RAW_FILE, this.buffer, false)

        // Start to iterate through the buffer

        // const validFloodFillPos = new Array();  // Track flood fill positions
        // const cacheColorMatch = new Set() // Track colors that previously matched*

        let y_start = 0;
        
        const USERNAME_LEFT_PADDING = parseInt(this.USERNAME_LEFT_PADDING_PCT * this.imageSize.w)
        const USERNAME_RIGHT_MIN = parseInt(this.USERNAME_RIGHT_MIN_PCT * this.imageSize.w)
        const USERNAME_BOX_HEIGHT = parseInt(this.USERNAME_BOX_HEIGHT_PCT * this.imageSize.h)
        
        // Normalize y_offsets into pixel lengths
        const CHECK_LINE_OFF = this.CHECK_LINES_PCT.map( check_offset => parseInt(check_offset * this.imageSize.h))
        const ANTI_LINE_OFF = this.ANTI_LINES_PCT.map( check_offset => parseInt(check_offset * this.imageSize.h))

        // const USERNAME_COLOR_ARR = Array.from(this.USERNAME_COLORS, color => toRGBA(color))
        const USERNAME_COLOR_RANGE_ARR = Object.values(userColors)
        // const COLOR_DIFF = 60; // max

        // this.setPixel(0,0, toRGBA(this.STREAMER_RED))
        // let rgba_test = this.getPixel(0,0)
        // y_start = Infinity

        let depthInit = 0       // Flood-fill debug stats
        let floodFillUse = 0

        // Begin iterating through the buffer
        while ( y_start < this.bufferSize.h ) {
            let x_start = this.bufferSize.w-1;
            let failedMatchVertLines = 0;

            while (x_start >= 0) {   // RIGHT->LEFT search
                let foundMatch = false;

                // verify anti-line, matches here stop iteration
                for (const check_px_off of ANTI_LINE_OFF) {
                    let px_rgba = this.getPixel(x_start, y_start+check_px_off)
                    if (this.debug) this.setPixel(x_start, y_start+check_px_off, toRGBA(YELLOW))

                    if ( USERNAME_COLOR_RANGE_ARR.some( ([color, range])  => redmean(color, px_rgba) < range) ) {
                        // do not continue iterating
                        failedMatchVertLines = Infinity
                        if (this.debug) this.setPixel(x_start, y_start+check_px_off, toRGBA(RED))
                        break
                    }
                }

                // check pixel on each y_band
                for (const check_px_off of CHECK_LINE_OFF) {
                    
                    if (failedMatchVertLines == Infinity) break // break-flag due to anti-line

                    let px_rgba = this.getPixel(x_start, y_start+check_px_off)

                    if (px_rgba[3] < 0xFF) { // previously visited
                        if (px_rgba[3] == MATCH_ALPHA) {
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

                    const colorRange = USERNAME_COLOR_RANGE_ARR.find( (colorRange)  => {
                        let [color, range] = colorRange
                        const cacheMap = cacheColorMatch.get(colorRange)
                        if (!cacheMap.has(hashArr(px_rgba)) )
                            cacheMap.set(hashArr(px_rgba), redmean(color, px_rgba))
                        
                        let cacheRedMean = cacheMap.get(hashArr(px_rgba))
                        return cacheRedMean < range 
                    })

                    // TODO: Cache check is bad AND late
                    if ( colorRange != undefined) {

                        failedMatchVertLines = 0
                        foundMatch = true
                        
                        // do flood-fill
                        cacheColorMatch.get(colorRange).set(hashArr(px_rgba), redmean(colorRange[0], px_rgba))
                        depthInit += 1
                        
                        const anti_y_lines = new Set(ANTI_LINE_OFF.map(y_line => y_line + y_start))
                        floodFillUse += this.floodFillSearch(x_start, y_start+check_px_off, 
                                                colorRange, cacheColorMatch.get(colorRange),
                                                anti_y_lines, 2)
                    }
                }
                
                
                if (x_start > (this.bufferSize.w - USERNAME_RIGHT_MIN)) foundMatch = true // continue if not past 3 characters

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
        // const offsetCoord = [[0,1], [0,-1], [-1,-1], [-1,0], [-1,1]] // there is 100% unchecked expansion towards the right
        const [matchColor, matchRange] = colorKey
        const floodFillQueue = [] // [x,y,exp]

        floodFillQueue.push( ...offsetCoord.map( ([tx,ty]) => [x+tx, y+ty, expand]))

        // We know x,y matches, set alpha and overwrite main
        let fst_px_rgba = this.getPixel(x,y)
        if (this.debug) fst_px_rgba = toRGBA(RED)
        fst_px_rgba[3] = MATCH_ALPHA
        
        this.setBinPixel(x,y, toRGBA(BLACK))
        this.setPixel(x,y, fst_px_rgba)

        while (floodFillQueue.length > 0) {
            const coord = floodFillQueue.pop(0)
            const [cx, cy] = coord
            if (cx < 0 || cx >= this.bufferSize.w || cy < 0 || cy >= this.bufferSize.h) continue
            
            let px_rgba = this.getPixel(cx, cy)
            if (px_rgba[3] != 0xFF) continue    // already visited

            breathIterCount += 1

            let redMeanValue = null
            // let redMeanValue = redmean(matchColor, px_rgba)
            const arrHashValue = hashArr(px_rgba)
            if (colorCache.has(arrHashValue)) {
                // console.debug('Cache Hit!')
                redMeanValue = colorCache.get(arrHashValue)
            } else {
                redMeanValue = redmean(matchColor, px_rgba)
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
            const avgCh = parseInt( 0xFF - ((0xFF - chOffset)**2) / 0xFF ) // log fall-off
            const bw_rgba = [avgCh, avgCh, avgCh, 0xFF]
            
            // px_rgba = matchUserColor ? toRGBA(bw_rgba, MATCH_ALPHA) : toRGBA(bw_rgba, NO_MATCH_ALPHA)
            px_rgba = bw_rgba

            this.setBinPixel(cx, cy, px_rgba) // set in binBuffer
            
            px_rgba[3] = matchPxUNColorBool ? MATCH_ALPHA : NO_MATCH_ALPHA
            if (this.debug) {
                px_rgba = toRGBA(MAHOGANY, px_rgba[3]) // brown* for flood-fill // TODO: Blend pixel instead?
            }
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
        // const [matchColor, matchRange] = colorKey
        const floodFillQueue = [] // [x,y,exp]

        floodFillQueue.push( ...offsetCoord.map( ([tx,ty]) => [x+tx, y+ty, -1]))

        // We know x,y matches, set alpha and overwrite main
        let fst_px_rgba = this.getPixel(x,y)
        if (this.debug) fst_px_rgba = toRGBA(ORANGE)
        fst_px_rgba[3] = ANTI_MATCH_ALPHA
        
        this.setBinPixel(x,y, toRGBA(WHITE))
        this.setPixel(x,y, fst_px_rgba)

        while (floodFillQueue.length > 0) {
            const coord = floodFillQueue.pop(0)
            const [cx, cy, expand] = coord
            if (cx < 0 || cx >= this.bufferSize.w || cy < 0 || cy >= this.bufferSize.h) continue
            
            let px_rgba = this.getPixel(cx, cy)
            if (px_rgba[3] <= ANTI_MATCH_ALPHA || px_rgba[3] == 0xFF) continue    // already visited by anti-fill

            breathIterCount += 1

            px_rgba[3] = ANTI_MATCH_ALPHA
            this.setBinPixel(cx, cy, toRGBA(WHITE)) // set in binBuffer
            px_rgba = toRGBA(YELLOW, px_rgba[3])
            this.setPixel(cx, cy, px_rgba)

            floodFillQueue.push( ...offsetCoord.map( ([tx,ty]) => [cx+tx, cy+ty, -1]))

        }

        return breathIterCount

    }

    bufferToPNG(buffer=this.buffer, scaleForOCR=true) {
        // let retPromise = null
        let bufferPromise = sharp(buffer, {
            raw: {  width: this.bufferSize.w, 
                    height: this.bufferSize.h, 
                    channels: this.bufferSize.channels, 
                    premultiplied: this.bufferSize.premultiplied}
        })
        if (scaleForOCR) {
            bufferPromise = bufferPromise.resize({width:1000})
                                        .blur(1)
                                        .withMetadata({density: 300})
        }
        return bufferPromise.png()
    }

    bufferToFile(filename, buffer=this.buffer, scaleForOCR=true) {
        return this.bufferToPNG(buffer, scaleForOCR).toFile(filename)
    }

}
