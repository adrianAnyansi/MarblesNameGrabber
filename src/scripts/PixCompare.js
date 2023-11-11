
// const dir = 'testing/Color compare/'
const dir = 'testing/waiting to start check/'
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
const PIXEL_ALL = []
const PIXEL_UNMARKED = new Set()

const outputFilename = "Pixels.json"

function toRGBA (hexColor, alpha=0xFF) {
    const mask = 0xFF
    return new Uint8Array([(hexColor >> 8*2) & mask,
            (hexColor >> 8*1) & mask, 
            hexColor & mask,
            alpha])
}

function calcMinColorDistance (colorList) {
    // binary search across each color channel
    const redRange =    [0,255]
    const blueRange =   [0,255]
    const greenRange =  [0,255]

    const ranges = [redRange, blueRange, greenRange]
    const midOfRange = range => parseInt((range[1] - range[0])/2) + range[0]

    // const RGBA_LIST = colorList.map( c => toRGBA(c))
    const RGBA_LIST = colorList
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

function calcMinColorDistRGB(rgbaList) {
    // binary search across each color channel
    const redRange =    [0,255]
    const blueRange =   [0,255]
    const greenRange =  [0,255]

    const ranges = [redRange, blueRange, greenRange]
    const midOfRange = range => parseInt((range[1] - range[0])/2) + range[0]

    while (ranges.some(range => range[0] < range[1])) {
        
        for (const idx in ranges) {
            const range = ranges[idx]
            if (range[0] >= range[1]) continue

            const midRange = midOfRange(range)
            

        }
    }
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
        PIXEL_ALL.push(fromPxOffset(px))

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

const content = JSON.stringify(PIXEL_ALL)
fs.writeFile(outputFilename, content, err => {
    if (err)  console.error(err);
});

let str = ""
let count = 0
for (const point of PIXEL_MARKED) {
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