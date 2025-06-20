
// Utility class for color & measurements over here

import sharp from 'sharp'
import {Buffer} from 'node:buffer'

/**
 * @typedef {Uint8Array[]} RGBA
 * @typedef {Uint8Array[]} RGB
 */

/** Color utility class */
export class Color {

    // Black
    static BLACK            = Color.toRGBA(0x000000);
    static DARKGRAY         = Color.toRGBA(0x555555);
    static WHITE            = Color.toRGBA(0xFFFFFF);

    // Yellows & orange
    static YELLOW           = Color.toRGBA(0xFFFF00);
    static LIGHT_YELLOW     = Color.toRGBA(0xFFFFE0);
    static ORANGE           = Color.toRGBA(0xFFA500);

    // Browns
    static MAHOGANY         = Color.toRGBA(0xC04000);
    static MAHOGANY_DARK    = Color.toRGBA(0x902000);
    static TAN              = Color.toRGBA(0xD2B48C);
    static GOLDENROD        = Color.toRGBA(0xDAA520);

    // Reds
    static RED              = Color.toRGBA(0xFF0000);
    static CRIMSON          = Color.toRGBA(0xDC143C);
    static DARK_RED         = Color.toRGBA(0x8B0000);
    
    // Pink
    static HOT_PINK         = Color.toRGBA(0xFF00FF);
    static PINK             = Color.toRGBA(0xFFC0CB);
    static MAGENTA          = Color.toRGBA(0xFF00FF);
    static DARK_VIOLET      = Color.toRGBA(0x9400D3);
    static PURPLE           = Color.toRGBA(0x800080);

    // Blues
    static BLUE             = Color.toRGBA(0x0000FF);
    static DEEP_BLUE        = Color.toRGBA(0x483D8B);
    static TEAL             = Color.toRGBA(0x008080);
    static AQUA             = Color.toRGBA(0x00FFFF);
    static NAVY             = Color.toRGBA(0x000080);
    // static SUB_BLUE         = Color.toRGBA(0x7b96dc);

    // Greens
    static GREEN            = Color.toRGBA(0x008000);
    static GREEN_YELLOW     = Color.toRGBA(0xADFF2F);
    static LIME             = Color.toRGBA(0x00FF00);
    static LIME_GREEN       = Color.toRGBA(0x32CD32);



    /** Default Alpha value */
    static DEFAULT_ALPHA =      0xFF;
    /** Matched Alpha value */
    static MATCH_ALPHA =        0xFE
    /** No Match Alpha value */
    static NO_MATCH_ALPHA =     0xFD
    /** Matched but in wrong position value */
    static ANTI_MATCH_ALPHA =   0xFC

    static CreateRGB(r_channel=0, g_channel=0, b_channel=0) {
        return new Uint8Array([r_channel, g_channel, b_channel])
    }

    /** 
     * @param {RGB} rgb array of uint8, alpha is ignored
     * @returns {number} hex value in decimal
     */
    static toHex(rgb) {
        return (rgb[0] << 8*2) + (rgb[1] << 8*1) + rgb[2];
    }

    static INT8MASK = 0xFF;

    /**
     * Convert decimal to RGB, Little Endiean
     * @param {Number} decimal 
     * @returns {RGB}
     */
    static castRGBLE(decimal) {
        return new Uint8Array([
            (decimal & Color.INT8MASK),
            (decimal >> 8*1) & Color.INT8MASK,
            (decimal >> 8*2) & Color.INT8MASK,
        ])
    }

    /**
     * Convert decimal to RGBA
     * @param {Number} decimal 
     * @returns {RGBA}
     */
    static castRGBALE(decimal) {
        return new Uint8Array([
            (decimal & Color.INT8MASK),
            (decimal >> 8*1) & Color.INT8MASK,
            (decimal >> 8*2) & Color.INT8MASK,
            (decimal >> 8*3) & Color.INT8MASK,
        ])
    }

    /**
     * Returns a UintArray using a valid hexadecimal number
     * Alpha is set to 255 by default. Extra digits after 0xFFFFFF are ignored
     * @param {Number} hexColor 
     * @param {Number} alpha 
     * @returns {Uint8Array[]}
     */
    static toRGBA (hexColor, alpha=0xFF) {
        const mask = 0xFF
        return new Uint8Array([(hexColor >> 8*2) & mask,
                (hexColor >> 8*1) & mask, 
                hexColor & mask,
                alpha])
    }

    /**
     * To RGB value
     * @param {RGBA} rgba 
     */
    static toRGB(rgba) {
        return rgba.slice(0, 3)
    }

    // https://stackoverflow.com/questions/4754506/color-similarity-distance-in-rgba-color-space
    // NOTE: SO on pre-multiplied alpha, but note my colours are all 100% alpha
    static redmean (rgba, rgba2) {
        // https://en.wikipedia.org/wiki/Color_difference
        // Referenced from here: https://www.compuphase.com/cmetric.htm
        // Range should be ~255*3
        const redmean = 0.5 * (rgba[0]+rgba2[0])

        const redComp   = (2+redmean/256)       * (rgba[0]-rgba2[0])** 2
        const greenComp =   4                   * (rgba[1]-rgba2[1])** 2
        const blueComp  =  (2+(255-redmean)/256) * (rgba[2]-rgba2[2])** 2

        return Math.sqrt(redComp+greenComp+blueComp)
    }

    /**
     * From a list of colors, calc the bounding box of the color
     * @param {*} colorList 
     * @returns {[Number, Number]}
     * @deprecated
     */
    static  calcMinColorDistance (colorList) {
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

    static sqrColorDistance (rgba, rgba2) {
        let ans = 0
        for (let idx in rgba)
            ans += (rgba[idx]-rgba2[idx]) ** 2
        return ans
    }

    /**
     * Helper function to hash arrays to strings for Set
     * @param {RGBA} rgba
     * @returns {string} hashString
     */
    static hashRGB(rgba) {
        return `${rgba?.[0]},${rgba?.[1]},${rgba?.[2]}`
    }

    /**
     * Copy RGB to another RGB without duplicating
     * Alpha is ignored
     * @param {RGB} rgb1 
     * @param {RGB} rgb2 
     * @returns {RGB} copied reference
     */
    static copyTo(rgb1, rgb2) {
        rgb1[0] = rgb2[0]
        rgb1[1] = rgb2[1]
        rgb1[2] = rgb2[2]
        return rgb1
    }

    /**
     * Return the difference between both colors
     * Note negative values can be returned
     * @param {RGBA | RGB} rgba 
     * @returns {number[]}
     */
    static diff(rgb1, rgb2) {
        const r_diff = rgb1[0] - rgb2[0]
        const g_diff = rgb1[1] - rgb2[1]
        const b_diff = rgb1[2] - rgb2[2]

        return [r_diff, g_diff, b_diff]
    }

    /**
     * Return abs of a set of color channels
     * @param {number[]} rgba 
     * @returns {RGBA | RGB}
     */
    static abs(rgb) {
        return new Uint8Array([
            Math.abs(rgb[0]),
            Math.abs(rgb[1]),
            Math.abs(rgb[2])])
    }

    /**
     * Function that takes two values and returns the mean of all color channel
     * @param {RGBA} rgba1 
     * @param {RGBA} rgba2 
     * @returns {number}
     */
    static compareMean(rgba1, rgba2) {
        return this.sumColor(
            this.abs(this.diff(rgba1, rgba2))
        )/3;

        const r_diff = Math.abs(rgba1[0] - rgba2[0])
        const g_diff = Math.abs(rgba1[1] - rgba2[1])
        const b_diff = Math.abs(rgba1[2] - rgba2[2])

        return (r_diff+g_diff+b_diff) / 3;
    }

    /**
     * Return the total difference between all color values.
     * R <-> G + G <-> B + R <-> B
     * @param {RGBA | RGB} rgba 
     * @returns {number}
     */
    static sumDiff(rgba) {
        return Math.abs(rgba[0]-rgba[1])
            + Math.abs(rgba[1]-rgba[2])
            + Math.abs(rgba[0]-rgba[2])
    }

    static compareWhite(rgb, rgb2) {
        return this.sumColor(this.diff(rgb, rgb2))
    }

    /**
     * Sum color channels of RGB
     * @param {RGBA | RGB} rgb
     * @returns {number}
     */
    static sumColor(rgb) {
        return rgb[0] + rgb[1] + rgb[2]
    }

    /**
     * Return the average pixel from a list of pixels
     * @param {RGB[] | RGBA[]} rgba_list 
     * @returns {RGB | RGBA}
     */
    static avgPixel(...rgba_list) {
        if (rgba_list.length == 1) return rgba_list[0]

        const avgPxSum = rgba_list.reduce( (ppx, cpx) => 
            ppx.map((val, idx) => val + cpx[idx])
        )
        const avgPx = avgPxSum.map(px => Math.round(px / rgba_list.length))
        return new Uint8ClampedArray([...avgPx])
    }

    /**
     * Weighted grayscale conversion
     * @param {RGB | RGBA} rgba 
     * @returns {RGBA}
     */
    static weightedBW(rgba) {
        const avgCh = Math.round(0.299 * rgba[0]) +
        Math.round(0.587 * rgba[1]) +
        Math.round(0.114 * rgba[2]);
        return [avgCh, avgCh, avgCh, 0xFF]
    }

    /**
     * @param {number[]} ch3 3 channels
     */
    static add (rgb, ch3) {
        const retRGB = new Uint8Array(3)
        for (const ch in ch3) {
            retRGB[ch] = Math.min(rgb[ch] + ch3[ch], 255)
        }
        return retRGB
    }
}

/**
 * @typedef {Object} RectObj
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef RectBounds
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {string | ArrayBuffer} ImageLike 
 * filename or file buffer (with header)
 */

export class ImageBuffer {
    /**
     * @param {ArrayBuffer} arrayBuffer 
     * @param {number} width width of buffer
     * @param {number} height height of buffer
     * @param {3 | 4} channels Should be 3/4 in this century
     */
    constructor(arrayBuffer, width, height, channels) {
        /** @prop {Buffer} buffer */
        this.buffer = arrayBuffer
        /** @prop {number} width Width of the buffer */
        this.width = width
        /** @prop {number} height Height of the buffer */
        this.height = height
        /** @prop {number} channels Number of color channels (4 = RGBA) */
        this.channels = channels
    }

    /**
     * Creates a new Image with the bounds from the inputs.
     *  
     * @param {number} width width of buffer
     * @param {number} height height of buffer
     * @param {3 | 4} channels Should be 3/4 in this century
     */
    static Build(width, height, channels, defaultRGBA=Color.WHITE) {
        const buffer = Buffer.alloc((width * height * channels), new Uint8Array(defaultRGBA));
        return new ImageBuffer(buffer, width, height, channels);
    }

    /**
     * Create a copy of the ImageBuffer with the same dimensions and num of channels
     * @returns {ImageBuffer}
     */
    cloneDims() {
        return ImageBuffer.Build(this.width, this.height, this.channels);
    }

    /**
     * Clone the contents of this ImageBuffer to a new ImageBuffer
     * @returns {ImageBuffer}
     */
    clone() {
        const cloneBuffer = Buffer.copyBytesFrom(this.buffer)
        return new ImageBuffer(cloneBuffer, this.width, this.height, this.channels)
    }

    /**
     * Convert x,y coordinate to pixel offset (internal use-case)
     * @param {number} x_coord 
     * @param {number} y_coord
     * @returns {number} px_offset from 0
     */
    toPixelOffset (x_coord, y_coord) {
        return (y_coord * this.width + x_coord) * this.channels
    }

    /**
     * @param {number} px_offset 
     * @returns {[number, number]} [x,y]
     */
    toCoord (px_offset) {
        return [
            px_offset % this.width,
            Math.trunc(px_offset / this.width)
        ]
    }

    /**
     * Get pixel from arrayBuffer
     * @param {number} x 
     * @param {number} y
     * @returns {RGB | RGBA}
     */
    getPixel (x,y) {
        const px_off = this.toPixelOffset(x,y)
        if (this.channels == 3) {
            const decimal = this.buffer.readUIntLE(px_off, 3)
            return Color.castRGBLE(decimal)
        } else if (this.channels == 4) {
            const decimal = this.buffer.readUInt32LE(px_off)
            return Color.castRGBALE(decimal)
        }
    }

    /**
     * Set pixel in array buffer.
     * @param {number} x 
     * @param {number} y
     * @param {RGB | RGBA} rgba 
     * @param {number | null} [alpha=null] NOTE: alpha > rgba alpha > 0xFF 
     */
    setPixel (x,y, rgba, alpha=null) {
        const px_off = this.toPixelOffset(x,y)
        this.buffer.writeUInt8(rgba[0], px_off+0)
        this.buffer.writeUInt8(rgba[1], px_off+1)
        this.buffer.writeUInt8(rgba[2], px_off+2)

        const alpha_value = alpha ?? rgba[3] ?? 0xFF
        if (this.channels == 4 && alpha_value)
            this.buffer.writeUInt8(alpha_value, px_off+3)
    }
}

/**
 * Class to contain sharp memory reference and help with utility
 */
export class SharpImg {
    
    /**
     * Takes a buffer/etc and turns it into a sharp object
     */
    constructor(imageLike=null, imgBuffer=null) {
        /** @type {ImageLike} root data for the sharp image */
        this.rootData = imageLike
        /** @type {sharp.Sharp} sharp image on file */
        this.sharpImg = imageLike ? sharp(imageLike) : null
        /** @type {ImageBuffer} raw arrayBuffer with info. copy of sharp image */
        this.imgBuffer = imgBuffer
    }

    /**
     * Helper function to build SharpImg from a raw Buffer
     * @returns {SharpImg} new sharpImg from raw buffer
     */
    static FromRawBuffer(rawBuffer) {
        return new SharpImg(null, rawBuffer)
    }

    /**
     * Builds a raw buffer from the sharpImg variable into the imgBuffer variable
     * Once built, imgBuffer will not be rebuilt unless deleted.
     * @returns {Promise<ImageBuffer>}
     */
    async buildBuffer () {
        if (this.imgBuffer) return this.imgBuffer

        return this.sharpImg
            .raw()
            .toBuffer({resolveWithObject: true})
            .then( ({data, info}) => {
                if (data) {
                    this.imgBuffer = new ImageBuffer(data, info.width, info.height, info.channels);
                    return this.imgBuffer
                }
            })
            .catch( err => {
                console.warn(`Unable to make ImageBuffer; err${err}:${err.stack}`)
                throw err
            })
    }

    /**
     * Clear imgBuffer (set to null)
     */
    deleteBuffer () {
        this.imgBuffer = null
    }

    /** 
     * Return a cropped SharpImg object.
     * NOTE: There is a race condition if I don't clone the sharpImage per instance of crop
     * Therefore I always clone the rootData unless the flaf is used
     * Note that because this is NOT a Promise, do not use this across multiple threads
     * or async without creating a new Sharp object per child cropped object
     * @param {RectObj} cropRect 
     * @param {boolean} [cloneRootData=true]
     * @returns {SharpImg} cropped SharpImg
     */
    crop(cropRect, cloneRootData=true) {
        const parentSharpClone = cloneRootData ? new SharpImg(this.rootData) : this.sharpImg
        const new_obj = new SharpImg()
        new_obj.sharpImg = parentSharpClone.sharpImg.extract({
                left:   cropRect.x,
                top:    cropRect.y,
                width:  cropRect.w,
                height: cropRect.h
            })
        return new_obj
    }

    /**
     * Convert current buffer to a valid sharp object.
     * NOTE: Will use this.imgBuffer or this.sharpImg as source, throwing error if none
     * @param {Object} param1 
     * @param {boolean} [param1.scaleForOCR=false] 
     * @param {boolean} [param1.toPNG=false] 
     * @param {boolean} [param1.toJPG=false] 
     * @param {boolean} [param1.toRaw=false] 
     * @returns {sharp.Sharp}
     */
    toSharp({toPNG=false, toJPG=false, toRaw=false, scaleForOCR=false}) {
        
        // NOTE: changes to buffer are not reflected in array, use array first
        let bufferPromise = null
        if (this.imgBuffer)
            bufferPromise = sharp(this.imgBuffer.buffer, {
                raw: {  width: this.imgBuffer.width, 
                    height: this.imgBuffer.height, 
                    channels: this.imgBuffer.channels, 
                }
                // TODO: premultiplied: this.bufferSize.premultiplied}
            })
        else if (this.sharpImg)
            bufferPromise = this.sharpImg

        if (!bufferPromise) throw Error("Trying to build buffer when both objects are NULL")

        if (scaleForOCR) {
            bufferPromise = bufferPromise.resize({width:400, kernel:'mitchell'})
                .blur(1)
                .withMetadata({density: 300})
        }

        if (toPNG) return bufferPromise.png()
        if (toJPG) return bufferPromise.jpeg({quality:100})
        if (toRaw) return bufferPromise.raw()

        // TODO: if supporting file (with format), use toFile

        throw Error("Did not specify output")
    }
}

export class Direction2D {
    static RIGHT = [1,0]
    static LEFT = [-1,0]
    static UP = [0,-1]
    static DOWN = [0,1]
    static UP_LEFT = [-1,-1]
    static DOWN_LEFT = [-1,1]
    static UP_RIGHT = [1,-1]
    static DOWN_RIGHT = [1,-1]
}

/** Class for managing resolution & targetting */
export class PixelMeasure {
    constructor(basisWidth, basisHeight) {
        // TODO: Make sure this are integers
        this.basisWidth = basisWidth;
        this.basisHeight = basisHeight;
        // this.map = new Map();
    }

    /** measured at width */
    static MEASURE_WIDTH = 1920;
    /** measured at height */
    static MEASURE_HEIGHT = 1080;

    /** round integers to certain values */
    static castToInt(val, round, floor, ceil) {
        if (round)
            return Math.round(val);
        else if (floor)
            return Math.floor(val);
        else if (ceil)
            return Math.ceil(val);
        else
            return val
    }

    /** Return x unit calculated  
     * @param {number} x_pixels horizontal pixels
     * @return {number}
    */
    getHorizUnits (x_pixels, options={round:false, floor:false, ceil:false}) {
        const {round, floor, ceil} = options
        return PixelMeasure.castToInt(
            x_pixels / PixelMeasure.MEASURE_WIDTH * this.basisWidth,
        round, floor, ceil);
    }
    
    /** Return y unit calculated  
     * @param {number} y_pixels vertical pixels
     * @return {number}
    */
    getVerticalUnits (y_pixel_coord, options={round:false, floor:false, ceil:false}) {
        const {round, floor, ceil} = options
        return PixelMeasure.castToInt(
            y_pixel_coord / PixelMeasure.MEASURE_HEIGHT * this.basisHeight,
            round, floor, ceil);
    }

    getRect (x_px, y_px, width_px, height_px) {
        return {
            x: this.getHorizUnits(x_px, {floor:true}),
            w: this.getHorizUnits(width_px, {ceil:true}),
            y: this.getVerticalUnits(y_px, {floor:true}),
            h: this.getVerticalUnits(height_px, {ceil:true}),
        }
    }

    /**
     * Return rectangle normalized from measured pixels
     * @param {RectObj} rect 
     * @return {RectObj}
     */
    normalizeRect(rect) {
        return this.getRect(rect.x, rect.y, rect.w, rect.h);
    }

}

/** Helper class for Image Comparisons */
export class ImageTemplate {

    constructor(imageLike, rectObj, name='') {
        this.imageLike = imageLike;
        this.rectObj = rectObj;
        this.sharpImg = new SharpImg(imageLike)
        this.name = name

        this.sharpImg.buildBuffer() // NOTE: Build during pre-process
    }
}
