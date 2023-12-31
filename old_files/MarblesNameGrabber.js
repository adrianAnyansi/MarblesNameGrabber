/*
This is a class that scrapes video frames in order to read marbles namelists

This is the previous in-browser version that's no longer being used
*/

class MarbleNameGrabber {

    nameRect = {
        x: 957/1920,
        y: 152/1080,
        w: (1507-957)/1920,
        h: (1080-154)/1080
    }

    LINE_HEIGHT = 1
    LINE_OFFSET = 0.01

    BLACK           = 0x000000
    WHITE           = 0xFFFFFF
    STREAMER_RED    = 0xFF0000
    SUB_BLUE        = 0x0000FF
    MOD_GREEN       = 0x00FF00
    VIP_PINK        = 0xFF00FF

    USERNAME_COLORS = [
        this.STREAMER_RED,
        this.SUB_BLUE,
        this.MOD_GREEN,
        this.VIP_PINK
    ]

    DEBUG_CANVAS_HEIGHT = '500px'
    DEBUG_CANVAS_WIDTH = '700px'

    constructor(debug=true) {
        // Get references, etc
        
        this.offCanvas = new OffscreenCanvas(this.nameRect.w, this.nameRect.h) // where to blit 
        this.offCtx = this.offCanvas.getContext('2d', {alpha:false})

        this.imgData = null // saving imageData

        this.debug = debug  // debug variables
        this.onCanvas = null
        this.onCtx = null

        this.video = null
        this.debugPicture = null

        if (this.debug) {
            this.onCanvas = document.createElement('canvas')
            this.onCanvas.addEventListener('mousemove', this.showDebugLines.bind(this))
            this.onCtx = this.onCanvas.getContext('bitmaprenderer')
            document.body.appendChild(this.onCanvas)
            this.onCanvas.style.height = this.DEBUG_CANVAS_HEIGHT
            this.onCanvas.style.width = "300px" //this.DEBUG_CANVAS

        }

        // TODO: Check for debug-picture flag, otherwise get video

        // start proper setup
        this.retrieveVideo()
    }

    retrieveVideo () {
        // check if debug-img is there, capture it if is

        let debugPic = document.querySelector('img#debugMarblesPic')
        const CANVAS_WIDTH = this.nameRect.w * this.debugPicture.width;
        const CANVAS_HEIGHT = this.nameRect.h * this.debugPicture.height;

        if (this.debug && debugPic) {
            this.debugPicture = debugPic
            this.offCanvas.width = CANVAS_WIDTH;
            this.offCanvas.height = CANVAS_HEIGHT;
            this.onCanvas.width = CANVAS_WIDTH;
            this.onCanvas.height = CANVAS_HEIGHT;
            return true
        }

        // Get video reference
        let videos = document.querySelectorAll('video')
        if (videos.length <= 1) {
            this.video = videos[0]
            this.offCanvas.width = CANVAS_WIDTH;
            this.offCanvas.height = CANVAS_HEIGHT;
            if (this.debug) {
                this.onCanvas.width = CANVAS_WIDTH;
                this.onCanvas.height = CANVAS_HEIGHT;
            }
            return true
        } else { // could not start, error
            console.error(`More than one video was found, issue occurred`)
            return false
        }
    }

    copyFrame () {
        // Copy frame to canvas
        let imgCapture = null
        if (this.debugPicture) {
            imgCapture = this.debugPicture
        } else if (this.video) {
            imgCapture = this.video
        } else if (!this.video) {
            console.warning("Video does not exist.")
            return 
        }
        
        // truncate to just namelist
        // let nameListRect = this.expand(this.nameRect)
        let nameListRect = this.getBounds(this.nameRect)
        // NOTE: Wrap towards the nameRect
        this.offCtx.drawImage(imgCapture, ...nameListRect, 0, 0, nameListRect[2], nameListRect[3]) // draw to canvas
        this.imgData = this.offCtx.getImageData(0,0,this.offCanvas.width, this.offCanvas.height) // ignore settings

        this.moveToDebugCanvas()
    }

    moveToDebugCanvas () {
        if (!this.debug) return
        this.onCtx.transferFromImageBitmap(this.offCanvas.transferToImageBitmap())
    }

    getBounds (rect) {
        // Choose between items
        let tmpRect = [-1, -1, -1, -1]
        let bounds = {w:null, h:null}
        if (this.debugPicture) {
            bounds.w = this.debugPicture.width
            bounds.h = this.debugPicture.height
        } else if (this.video) {
            bounds.w = this.video.videoWidth
            bounds.h = this.video.videoHeight
        } else {    throw Error("No capture available") }

        return [
            rect.x * bounds.w,
            rect.y * bounds.h,
            rect.w * bounds.w,
            rect.h * bounds.h,
        ]
    }

    expand (rect) {
        return [
            rect.x * this.video.videoWidth,
            rect.y * this.video.videoHeight,
            rect.w * this.video.videoWidth,
            rect.h * this.video.videoHeight
        ]
    }

    toPixel (x_coord, y_coord) {
        // Get the pixel_offset to a location
        let pixel_offset = (y_coord * this.offCtx.width + x_coord) * 4;
        return pixel_offset
    }

    toCoord (pixel_offset) {
        // Map to coordinate
        let y_coord = parseInt(pixel_offset/4 * 1 / this.offCtx.width) 
        let x_coord = parseInt((pixel_offset/4) % this.offCtx.width)
        return {x: x_coord, y: y_coord}
    }

    /*
    Lines are also removed without smooth animation, meaning that the lines do
    accurately sit on the line boundaries
    */

    isolateUserNames () {
        /*
        Logic, using the offset and box size.
        Look from right->left. Multiple passes
            1. Move right to left with the dot check, mark for flood-fill
            2. When reaching 4 vertical lines without userColor, exit
            3. Flood-fill to black respecting intensity, copy to new imgData


        Initution: Simply move from right->left looking for a big color gap
            Ignore anything that matches BLACK or user colors
        */

        LINE_HEIGHT_PX = this.LINE_HEIGHT * this.video.videoHeight
        LINE_OFFSET_PX = this.LINE_OFFSET * this.video.videoHeight

        let line_st = 0
        
        while (line_st < this.video.videoHeight) {
            let line_check = line_st + LINE_OFFSET_PX;
            
        }

        for (let pxd = 0; pxd < this.imgData.length; pxd += 4) {

            let hexColor =  imageData.data[i + 0] << 0xFF**2 +
                            imageData.data[i + 1] << 0xFF**1 +
                            imageData.data[i + 2]
            
            if (this.USERNAME_COLORS.contains(hexColor)) {
                this.imgData.data[i+0] = 0xFF
                this.imgData.data[i+1] = 0xFF
                this.imgData.data[i+2] = 0xFF
            }
            
        }
    }

    // Deprecated, used for colourspace checking
    showDebugLines (mouseEvent) {
        // Run debug lines based on mouse position

        let mouse_y = mouseEvent.offsetY // relative mouse y
        mouse_y = parseInt(mouse_y / this.onCanvas.offsetHeight * this.offCanvas.height)
        this.debugLineIntensity(mouse_y)
    }

    debugLineIntensity (y) {
        // Taking the x,y position of the mouse, draw intensity lines

        if (y == null) throw Error()

        this.copyFrame()
        // console.debug(`Reading y_coord ${y}`)
        // Determine line -> imgData range
        let px_start =  4 * this.imgData.width * (y);
        let px_end =    4 * this.imgData.width * (y+1);

        let halfY = parseInt(this.imgData.height / 2) 

        this.offCtx.lineWidth = 2; // 3 pixels
        // this.offCtx.strokeStyle = 'pink'
        this.offCtx.lineJoin = 'round'

        const CHECK_COLOR = 'yellow'
        const BW_COLOR = 'pink'
        const RED_COLOR = 'red'
        const BLUE_COLOR = 'aqua'
        const GREEN_COLOR = 'forestgreen'

        const IMG_WIDTH = this.imgData.width

        let bwYCoordArr = new Uint16Array(IMG_WIDTH)
        let rYCoordArr = new Uint16Array(IMG_WIDTH)
        let bYCoordArr = new Uint16Array(IMG_WIDTH)
        let gYCoordArr = new Uint16Array(IMG_WIDTH)

        // this.offCtx.beginPath()
        // this.offCtx.moveTo(0,0)
        let px_idx = 0

        while (px_start < px_end) {
            const R = this.imgData.data[px_start + 0]
            const G = this.imgData.data[px_start + 1]
            const B = this.imgData.data[px_start + 2]

            // calc bw normalized value
            let bwIntensity = (R+G+B)/3;
            bwYCoordArr[px_idx] = bwIntensity 
            rYCoordArr[px_idx]  = R
            gYCoordArr[px_idx]  = G
            bYCoordArr[px_idx]  = B
            px_idx++
            // console.debug(`0x${R.toString(16)}.${G.toString(16)}.${B.toString(16)}  ${bwIntensity.toFixed(2)}`)
            
            // draw on y coord using opposite half of the image
            // const x_coord = (px_start % (4*IMG_WIDTH)) / 4
            // let px_loc = null
            // const y_coord = int(px_start / this.imgData.width)

            // BW Draw
            // let bwY = parseInt(this.imgData.height/2 * bwIntensity);
            // px_loc = bwY * (4*IMG_WIDTH) + x_coord*4
            // console.debug(`Sampled ${x_coord},${y} output ${x_coord},${bwY}`)
            
            // this.offCtx.lineTo(x_coord, bwY)

            // for (let i of [0,1,2])
            //     this.imgData.data[px_loc+i] = bwIntensity * 0xFF;
            // Setting line to yellow
            this.imgData.data[px_start+0] = 0xFF
            this.imgData.data[px_start+1] = 0xFF
            this.imgData.data[px_start+2] = 0x00

            
            px_start += 4;
        }

        // Now copy the imageData back to the ctx
        this.offCtx.putImageData(this.imgData, 0, 0)

        // Start to do the lines for each ontop of the previous image
        const colorArr = [BW_COLOR, RED_COLOR, GREEN_COLOR, BLUE_COLOR]
        const yCoordArrs =  [bwYCoordArr, rYCoordArr, gYCoordArr, bYCoordArr]

        for (let idx of [0,1,2,3]) {

            let y_arr = yCoordArrs[idx]
            this.offCtx.beginPath()
            this.offCtx.strokeStyle = colorArr[idx]
            // let x_coord = 0
            let y_offset = idx/yCoordArrs.length * this.imgData.height

            for (let x_coord in y_arr) {
                let y_coord = y_arr[x_coord]
                y_coord /= 0xFF // turn coord into a percentage
                y_coord *= this.imgData.height/yCoordArrs.length
                if (x_coord == 0) this.offCtx.moveTo(x_coord, y_coord+y_offset)
                else this.offCtx.lineTo(x_coord, y_coord+y_offset)
                // x_coord++
            }

            this.offCtx.stroke()
        }


        // drawing on top of previous image
        // this.offCtx.stroke()
        this.moveToDebugCanvas()
    }
}


// Testing on https://www.twitch.tv/videos/1895894790?t=06h41m23s
//

// TODO: Changing to a single image makes testing much faster
// Will make a test page probably containing just the 

// Active testing
let m = new MarbleNameGrabber(true)
m.video.pause()
console.clear()
m.copyFrame()