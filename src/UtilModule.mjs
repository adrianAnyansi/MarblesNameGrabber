
// Utility class for color & measurements over here

import sharp from 'sharp'
import {Buffer} from 'node:buffer'

/** Color utility class */
export class Color {

    /**
     * @typedef RGBA
     * @type {Uint8Array[]}
     */
    static BLACK           = Color.toRGBA(0x000000);
    static DARKGRAY        = Color.toRGBA(0x555555);
    static WHITE           = Color.toRGBA(0xFFFFFF);
    static YELLOW          = Color.toRGBA(0xFFFF00);
    static ORANGE          = Color.toRGBA(0xFFA500);
    static MAHOGANY        = Color.toRGBA(0xC04000);
    static MAHOGANY_DARK   = Color.toRGBA(0x902000);
    static RED             = Color.toRGBA(0xFF0000);

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
     * @param {number[]} rgba array of uint8, alpha is ignored
     * @returns hex value in numbers
     */
    static toHex(rgba) {
        return (rgba[0] << 8*2) + (rgba[1] << 8*1) + rgba[2];
    }

    /**
     * Returns a UintArray using a valid hexadecimal number
     * Alpha is set to 255 by default. Extra digits after 0xFFFFFF are ignored
     * @param {Uint8Array[3]} hexColor 
     * @param {Number} alpha 
     * @returns {Uint8Array[3]}
     */
    static toRGBA (hexColor, alpha=0xFF) {
        const mask = 0xFF
        return new Uint8Array([(hexColor >> 8*2) & mask,
                (hexColor >> 8*1) & mask, 
                hexColor & mask,
                alpha])
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
     * @param {Uint8Array} rgba
     * @returns 
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
     */
    static compareMean(rgba1, rgba2) {
        const r_diff = Math.abs(rgba1[0] - rgba2[0])
        const g_diff = Math.abs(rgba1[1] - rgba2[1])
        const b_diff = Math.abs(rgba1[2] - rgba2[2])

        return (r_diff+g_diff+b_diff) / 3;
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
     * 
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

    constructor(imageLike, rectObj) {
        this.imageLike = imageLike;
        this.rectObj = rectObj;
        this.bufferView = null;
        this.bufferViewPromise = BufferView.Build(imageLike)
    }

    async getBufferView() {
        return this.bufferViewPromise
    }
}


// console.log(
// Timestamp.msToHUnits(2000),
// Timestamp.msToHUnits(2002),
// Timestamp.msToHUnits(2022, false)
// )