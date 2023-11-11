
const dir = 'testing/blue compare/'
// const dir = 'testing/waiting to start check/'
const BLEND_FILE = 'blend.png'
const NON_BLEND_FILE = 'noblend.png'

import sharp from 'sharp'
import fs from 'fs'

const BLEND_SHARP = await sharp(dir+BLEND_FILE).raw().toBuffer()
const NOOBLEND_SHARP = await sharp(dir+NON_BLEND_FILE).raw().toBuffer()
const BLEND_META = await sharp(dir+BLEND_FILE).metadata()

const ADD_PIXEL = new Uint8Array([240, 0, 240, 255])
const REMOVE_COLOR = new Uint8Array([150, 255, 70, 255]) //new Uint8Array([70, 255, 150, 255])

const PIXEL_MARKED = new Set()
const PIXEL_LOC = []
const PIXEL_UNMARKED = new Set()

const outputFilename = "Pixels.json"

function toRGBA (hexColor, alpha=0xFF) {
    const mask = 0xFF
    return new Uint8Array([(hexColor >> 8*2) & mask,
            (hexColor >> 8*1) & mask, 
            hexColor & mask,
            alpha])
}

function cmpUInt(uintA, uintB) {
    for (let idx in uintB) {
        if (uintA[idx] != uintB[idx]) return false
    }
    return true
}

function toPixelOffset (x_coord, y_coord) {
    // Get the pixel_offset to a location
    let pixel_offset = (y_coord * this.bufferSize.w + x_coord) * this.bufferSize.channels;
    return pixel_offset
}

function fromPxOffset (pxch_offset) {
    const px_offset =  pxch_offset / BLEND_META.channels
    const y_coord = parseInt(px_offset / BLEND_META.width)
    const x_coord = px_offset % BLEND_META.width
    return [x_coord, y_coord]
}

// Check compare each pixel, if they differ, add to pixel chain
let px = 0
while (px < BLEND_SHARP.length) {
    const rgba = BLEND_SHARP.readUInt32LE(px)
    const rgba2 = NOOBLEND_SHARP.readUInt32LE(px)

    if (rgba != rgba2) {
        // PIXEL_MARKED.push(toRGBA(rgba2))
        const rgbaV = toRGBA(rgba2)
        const rgbaN = toRGBA(rgba)
        const rgbaStr = `(${rgbaV[0]}, ${rgbaV[1]}, ${rgbaV[2]})`
        PIXEL_LOC.push(fromPxOffset(px))

        if (cmpUInt(rgbaN, REMOVE_COLOR))
            PIXEL_UNMARKED.add(rgbaStr)
        else
            PIXEL_MARKED.add(rgbaStr)
    }
    px += 4
}

console.log(`MARKED PIXELS amount:${PIXEL_MARKED.size}`)
if (PIXEL_UNMARKED.size > 0)
    console.log(`UNMARKED PIXELS amount:${PIXEL_UNMARKED.size}`)

// Write positions to file
// const content = JSON.stringify(PIXEL_LOC)
// fs.writeFile(outputFilename, content, err => {
//     if (err)  console.error(err);
// });

let output_str = Array.from(PIXEL_MARKED).join('\n')
let px_mark_filename = 'markedPx.txt'
fs.writeFile(px_mark_filename, output_str, err => {
    if (err)  console.error(err);
});

let str = ""
let count = 0
// for (const point of PIXEL_MARKED) {
//     str += point
//     if (count++ >= 500) {
//         console.log(str)
//         str = ""
//         count = 0
//     }
//     else
//         str += ','
// }
// console.log(str)

console.log('=========')
console.log('PIXEL UNMARKED')
console.log('=========')

count = 0
str = ""

for (const point of PIXEL_UNMARKED) {
    str += point
    if (count++ >= 500) {
        console.log(str)
        str = ""
        count = 0
    }
    else
        str += ','
}

console.log(str)