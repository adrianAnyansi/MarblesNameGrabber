
// Utility class for color & measurements over here

import sharp from 'sharp'
import {Buffer} from 'node:buffer'

/** Color utility class */
export class Color {

    /**
     * @typedef {Uint8Array[]} RGBA
     * @typedef {Uint8Array[]} RGB
     */


    static BLACK           = Color.toRGBA(0x000000);
    static DARKGRAY        = Color.toRGBA(0x555555);
    static WHITE           = Color.toRGBA(0xFFFFFF);
    static YELLOW          = Color.toRGBA(0xFFFF00);
    static ORANGE          = Color.toRGBA(0xFFA500);
    static MAHOGANY        = Color.toRGBA(0xC04000);
    static MAHOGANY_DARK   = Color.toRGBA(0x902000);
    static RED             = Color.toRGBA(0xFF0000);
    static BLUE            = Color.toRGBA(0x0000FF);
    static GREEN           = Color.toRGBA(0x00FF00);

    static SUB_BLUE        = Color.toRGBA(0x7b96dc);
    static BRIGHT_GREEN    = Color.toRGBA(0x00FF00);
    static HOT_PINK        = Color.toRGBA(0xFF00FF);

    /** Default Alpha value */
    static DEFAULT_ALPHA =      0xFF;
    /** Matched Alpha value */
    static MATCH_ALPHA =        0xFE
    /** No Match Alpha value */
    static NO_MATCH_ALPHA =     0xFD
    /** Matched but in wrong position value */
    static ANTI_MATCH_ALPHA =   0xFC

    /** 
     * @param {RGB} rgb array of uint8, alpha is ignored
     * @returns hex value in numbers
     */
    static toHex(rgb) {
        return (rgb[0] << 8*2) + (rgb[1] << 8*1) + rgb[2];
    }

    static INT8MASK = 0xFF;

    /**
     * Convert decimal to RGB
     * @param {Number} decimal 
     * @returns {RGB}
     */
    static castRGB(decimal) {
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
    static castRGBA(decimal) {
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
     * Copy RGBA to another RGBA without duplicating
     * @param {*} rgba1 
     * @param {*} rgba2 
     */
    static copyTo(rgba1, rgba2) {
        rgba1[0] = rgba2[0]
        rgba1[1] = rgba2[1]
        rgba1[2] = rgba2[2]
    }

    /**
     * Function that takes two values and returns the mean of all color channel
     * @param {RGBA} rgba1 
     * @param {RGBA} rgba2 
     * @returns {number}
     */
    static compareMean(rgba1, rgba2) {
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
    static totalDiff(rgba) {
        return Math.abs(rgba[0]-rgba[1])
            + Math.abs(rgba[1]-rgba[2])
            + Math.abs(rgba[0]-rgba[2])
    }

    static compareWhite(rgb, rgb2) {
        return rgb[0] - rgb2[0] 
            + (rgb[1] - rgb2[1])
            + (rgb[2] - rgb2[2])
    }

    /**
     * Sum color values of RGB
     * @param {RGBA} rgb
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
}

/**
 * @typedef RectObj
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
     * Clone ImageBuffer
     */
    clone() {
        return ImageBuffer.Build(this.width, this.height, this.channels);
    }

    /**
     * @param {number} x_coord 
     * @param {number} y_coord
     */
    toPixelOffset (x_coord, y_coord) {
        return (y_coord * this.width + x_coord) * this.channels
    }

    /**
     * Get pixel from arrayBuffer
     * @param {number} x 
     * @param {number} y
     * @returns {RGB | RGBA}
     */
    getPixel (x,y) {
        const px_off = this.toPixelOffset(x,y)
        const decimal = this.buffer.readUInt32LE(px_off)
        if (this.channels == 3)
            return Color.castRGB(decimal)
        else if (this.channels == 4)
            return Color.castRGBA(decimal)
    }

    /**
     * Set pixel in array buffer.
     * @param {number} x 
     * @param {number} y
     * @param {RGB | RGBA} rgba 
     * @param {null} [alpha=null] Note alpha overrides rgba alpha if exists, then 0xFF if neither exists but alpha does
     */
    setPixel (x,y, rgba, alpha=null) {
        const px_off = this.toPixelOffset(x,y)
        this.buffer.writeUInt8(rgba[0], px_off+0)
        this.buffer.writeUInt8(rgba[1], px_off+1)
        this.buffer.writeUInt8(rgba[2], px_off+2)

        const alpha_value = alpha ?? rgba[3] ?? 0xFF
        if (this.channels == 4 && alpha_value)
            this.buffer.writeUInt8(rgba[3], px_off+3)
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
        /** sharp image on file */
        this.sharpImg = imageLike ? sharp(imageLike) : null
        /** @type {ImageBuffer} arrayBuffer with info. This is a copy of the sharp image */
        this.imgBuffer = imgBuffer
    }

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

    crop(cropRect) {
        let new_obj = new SharpImg()
        new_obj.sharpImg = this.sharpImg.extract({
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
     * @param {boolean} [scaleForOCR=false] 
     * @param {Object} param1 
     * @param {boolean} [param1.toPNG=false] 
     * @param {boolean} [param1.toJPG=false] 
     * @param {boolean} [param1.toRaw=false] 
     * @returns {sharp.Sharp}
     */
    toSharp(scaleForOCR=false, {toPNG=false, toJPG=false, toRaw=false}) {
        // NOTE: changes to buffer are not reflected in array, use array first
        let bufferPromise = null
        if (this.imgBuffer)
            bufferPromise = sharp(this.imgBuffer.buffer, {
                raw: {  width: this.imgBuffer.width, 
                    height: this.imgBuffer.height, 
                    channels: this.imgBuffer.channels, 
                }
                // TODO: Update if I decide to handle premultiplied
                // premultiplied: this.bufferSize.premultiplied}
            })
        else if (this.sharpImg)
            bufferPromise = this.sharpImg

        if (!bufferPromise) throw Error("Trying to build buffer when both objects are NULL")

        if (scaleForOCR) {
            bufferPromise = bufferPromise.resize({width:100, kernel:'mitchell'})
                .blur(1)
                .withMetadata({density: 300})
        }

        if (toPNG) return bufferPromise.png()
        if (toJPG) return bufferPromise.jpeg({quality:100})
        if (toRaw) return bufferPromise

        throw Error("Did not specify output")
    }
}

export class Direction2D {
    static RIGHT = [1,0]
    static LEFT = [-1,0]
    static UP = [0,-1]
    static DOWN = [0,1]
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

/** Helper class to access pixels in image buffer */
export class BufferView {
    
    /**
     * @param {Buffer} buffer 
     * @param {number} width 
     * @param {number} height
     * @param {number} channels
     */
    constructor(buffer, width, height, channels) {
        /** @prop {Buffer} buffer */
        this.buffer = buffer;
        /** @prop {number} width Width of the buffer */
        this.width = width;
        /** @prop {number} height Height of the buffer */
        this.height = height;
        /** @prop {number} channels Number of color channels (4 = RGBA) */
        this.channels = channels;
    }

    /**
     * Builds a full BufferView from imgLike (filename/buffer)
     * Helper function
     * @param {*} imgLike 
     * @returns {Promise<BufferView>} bufferView containing cropped* image
     */
    static async Build(imgLike, cropRect=null) {
        let sharpImg = sharp(imgLike)

        if (cropRect) {
            sharpImg = sharpImg.extract({left: cropRect.x, top:cropRect.y, 
                width:cropRect.w, height:cropRect.h})
        }

        return sharpImg
            .raw() // raw pixel data
            .toBuffer({resolveWithObject: true}) // to ArrayBuffer + metadata
            .then( ({data, info}) => {
                if (data) {
                    let bufferView = new BufferView(data, info.width, info.height, info.channels);
                    return bufferView
                }
            })
            .catch( err => {
                console.warn(`Unable to make BufferView; err${err}:${err.stack}`)
                throw err
            })
    }

    get size() {
        return this.buffer.byteLength;
    }


    /**
     * Static get RGBA value of pixel at particular location
     * @param {Number} x 
     * @param {Number} y
     * @returns {Uint8Array[Number, Number, Number, Number]} RGBA
     */
    getPixel (x, y) {
        const px_off = this.toPixelOffset(x, y)
        if (this.channels == 4) 
            return this.getRGBAPixel(px_off)
    }

    getRGBAPixel(px_off) {
        const rgba = this.buffer.readUInt32LE(px_off);
        const int8mask = 0xFF;
        return new Uint8ClampedArray([
            (rgba & int8mask),
            (rgba >> 8*1) & int8mask,
            (rgba >> 8*2) & int8mask,
            (rgba >> 8*3) & int8mask,
        ]);
    }

    /**
     * Get flat pixel offset from x,y values
     * @param {Number} x 
     * @param {Number} y
     * @returns {Number} px_offset
     */
    toPixelOffset (x_coord, y_coord) {
        return (y_coord * this.width + x_coord) * this.channels;
    }

    /**
     * Get coord array from pixel offset
     * @param {*} px 
     */
    getPx(px) {
        return this.getRGBAPixel(px * this.channels)
    }

    /**
     * Get pixels from top-left corner
     * @param {*} px 
     * @returns {[Number, Number]}
     */
    getCoord(px) {
        return [
            px % this.width,
            Math.trunc(px / this.width)
        ]
    }

    setPixel(x, y, rgba) {
        const px_off = BufferView.toPixelOffset(x,y)
        this.buffer.writeUInt8(rgba[0], px_off+0)
        this.buffer.writeUInt8(rgba[1], px_off+1)
        this.buffer.writeUInt8(rgba[2], px_off+2)
        if (rgba[3])
            this.buffer.writeUInt8(rgba[3], px_off+3)
    }
    
}

/** Helper class for Image Comparisons */
export class ImageTemplate {

    constructor(imageLike, rectObj, name='') {
        this.imageLike = imageLike;
        this.rectObj = rectObj;
        this.bufferView = null;
        this.bufferViewPromise = BufferView.Build(imageLike)
        this.name = name
    }

    async getBufferView() {
        return this.bufferViewPromise
    }
}


export class Mathy {

    /**
     * Test if number is within range of sourceNum+-range 
     * @param {number} testNum Number to test
     * @param {number} sourceNum Number to use as base
     * @param {number[]} range Either single number, or [lowNum, highNum]
     * @param {boolean} bothSides instead of assuming [0,range], assume [-range, range]
     */
    inRange(testNum, sourceNum, range) {

        if (range == 0) {
            return testNum == range
        }
        
        const testRange = []
        if (Array.isArray(range) && range.length == 2) {
            testRange.push(...range)
        } else {
            testRange.push(0, range)
        }

        if (testRange[0] > testRange[1]) {
            testRange.push(testRange.shift()) // swap 
        }
        testRange.forEach(val => val + sourceNum)

        return testNum > testRange[0] && testNum < testRange[1]
    }
}

// console.log(
// Timestamp.msToHUnits(2000),
// Timestamp.msToHUnits(2002),
// Timestamp.msToHUnits(2022, false)
// )