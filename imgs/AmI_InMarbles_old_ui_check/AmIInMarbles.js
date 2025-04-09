// Am I in Marbles viewer

const debug = true;
let imageData = null; 

let ocradPromise = fetch('https://antimatter15.com/ocrad.js/ocrad.js')
    .then(resp => resp.text())
    .then(val => {console.log('OCRAD.js has downloaded.');  geval(val); 
        console.log('OCRAD.js:Text Recognition has loaded!')} )

console.log('OCRAD:text recognition is loading!')

class Hex {
    static toxFF(num) {
        return num < 16 ? '0'+num.toString('16') : num.toString('16')
    }
    static toxFFFFFF(num) {
        return toxFF(num>>16&0xFF)+toxFF(num>>8&0xFF)+toxFF(num&0xFF);
    }
    static hexToRGB(hex) {
        return [hex>>16, hex>>8&0xFF, hex&0xFF]
    }
}


// -------------------------------------------

// capture video element
let videoElems = document.querySelectorAll('video');

if (videoElems.length > 1) console.warn('Found more than 1 video frame??') 
else if (videoElems.length == 0) {
    console.warn('Found no videos')
}

let videoFrame = document.querySelectorAll('video')[0]
const canvas = document.createElement('canvas')
canvas.height = 1080    // videoFrame.videoHeight // Hardcoding for max res
canvas.width = 1920     //videoFrame.videoWidth
const canvasctx = canvas.getContext('2d', {alpha: false})

// ---

const debugSearch = document.createElement('input');
const debugNum = document.createElement('span');
const debugList = document.createElement('span')

// Add debug to screen
const anchorClassName =  'Layout-sc-1xcs6mc-0 exfAFI'
// const anchorClassName = '.channel-info-content .tw-border-t'
const anchorEl = document.querySelector(anchorClassName)
anchorEl.append(debugSearch)
anchorEl.append(debugNum)
debugNum.textContent = '<uninit>'

if (debug) {
    canvasctx.fillStyle = "red"
    canvasctx.strokeStyle = "red"
    canvas.style.width = "100%"
    anchorEl.append(canvasctx)
    anchorEl.append(debugList)
}


function promiseText(rect, numeric=false, thres=560, scale=1) { // async OCR
    let imageData = canvasctx.getImageData(...rect)
    imageData = scale > 1 ? scaImg(binarization(imageData, thres), scale) : 
                            binarization(scaImg(imageData, scale), thres)
    return new Promise( (resolve) => {
        if (numeric) 
            OCRAD(imageData, {numeric: true}, resolve) // TODO: Just pass boolean?
        else {
            OCRAD(imageData, resolve)
        }
    })
    imageData = null //I'm leaking memory somehow, dunno how
}

function binarization(imagedata, threshold=175, invert=true) {
    let bw = invert ? [0, 0xFF] : [0xFF, 0]
    let binImage = new ImageData(imagedata.width, imagedata.height)
    for (let i=0; i < imagedata.data.length; i += 4) {
        px_sum = imagedata.data[i] + imagedata.data[i+1] + imagedata.data[i+2]
        bin = (px_sum > threshold) ? bw[0] : bw[1]
        binImage.data[i] = binImage.data[i+1] = binImage.data[i+2] = bin
        binImage.data[i+3] = 255
    }
    return binImage
}

function scaImg(srcImg, scale=1, pixelheight=0) {
    if (scale == 1) return srcImg // Dont do this thanks
    let scaImg = new ImageData(srcImg.width*scale, srcImg.height*scale)
    for (let y=0; y < scaImg.height; y++) {
        for (let x=0; x < scaImg.width; x++) {
            let srcX = Math.round(x * srcImg.width / scaImg.width)
            let srcY = Math.round(y * srcImg.height / scaImg.height)
            let srcIdx = (srcX + srcY * srcImg.width) * 4

            for (let rgb=0; rgb<3; rgb++)
                scaImg.data[(x + y * scaImg.width)*4+rgb] = srcImg.data[srcIdx+rgb]
            scaImg.data[(x + y * scaImg.width)*4+3] = srcImg.data[srcIdx+3] // alpha
        }
    }
    return scaImg
}

function scr() { // grab frame & save to canvas buffer, takes about 20-35ms on my laptop 
    // let p = performance.now()
    if (!videoFrame.parentElement) //sometimes video ref is lost
        videoFrame = document.querySelector('video')
    canvasctx.drawImage(videoFrame, 0, 0, videoFrame.videoWidth, videoFrame.videoHeight)
    // console.log(`Took ${performance.now()-p}ms to get video frame`)
}

const marbleNameBox = [0, 0, 1920, 1080];

function readTheNames () {
    
    scr() // save image to canvas
    let reducedImgData =  canvasctx.getImageData(marbleNameBox);
    if (debug) canvasctx.strokeRect(...rect)

    let strPromise = promiseText(reducedImgData, false)
    strPromise.then(resolve => {console.log(`Output is ${resolve}`)})

}
