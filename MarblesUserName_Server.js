// Node Server that manages, saves and processes images for MarblesNameGrabber

import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import sharp from 'sharp'
import { spawn } from 'node:child_process'


import {MarbleNameGrabberNode} from "./MarblesNameGrabberNode.mjs"
import {UsernameTracker} from './UsernameTrackerClass.mjs'

import { createWorker, createScheduler } from 'tesseract.js'
import { setInterval } from 'node:timers'

const server = express()
const PORT = 4000;
const HOST = 'localhost'

// debug variables
const debug = true;
const debugTesseract = false;
const debugProcess = false

// server state
const SERVER_STATE_ENUM = {
    STOPPED: 'STOPPED',
    RUNNING: 'RUNNING',
    READING: 'READING'
}
let serverState = SERVER_STATE_ENUM.STOPPED
const serverStatus = {
    imgs_downloaded: 0,
    imgs_read: 0,
    started_stream_ts: null,
}
let parserInterval = null

const DEBUG_URL = 'https://www.twitch.tv/videos/1891700539?t=2h30m20s' // "https://www.twitch.tv/videos/1895894790?t=06h39m40s"
const LIVE_URL = '"https://www.twitch.tv/barbarousking"'
let globalStreamURL = DEBUG_URL
const streamlinkCmd = ['streamlink', globalStreamURL, 'best', '--stdout'] 
// const ffmpegCmd = ['ffmpeg', '-re', '-f','mpegts', '-i','pipe:0', '-f','image2', '-pix_fmt','rgba', '-vf','fps=fps=1/2', '-y', '-update','1', 'live.png']
// const ffmpegCmd = ['ffmpeg', '-re', '-f','mpegts', '-i','pipe:0', '-f','image2', '-pix_fmt','rgba', '-vf','fps=fps=1/2', 'pipe:1']
let ffmpegFPS = '2'
const ffmpegCmd = ['ffmpeg', '-re', '-f','mpegts', '-i','pipe:0', '-f','image2pipe', '-pix_fmt','rgba', '-c:v', 'png', '-vf',`fps=fps=${ffmpegFPS}`, 'pipe:1']

let pngChunkBufferArr = []
const PNG_MAGIC_NUMBER = 0x89504e47 // Number that identifies PNG file

let streamlinkProcess = null
let ffmpegProcess = null

const TEST_FILENAME = "testing/test.png"
const LIVE_FILENAME = "live.png"

// Tesseract variables
let OCRScheduler = null
let numOCRWorkers = 0

const READ_IMG_TIMEOUT = 1000 * 0.25;
let lastReadTs = null

const usernameList = new UsernameTracker();

// Debug code
// {

//     console.log("Running special debug")
    
//     // let user1 = 'hello'
//     // let user2 = 'kelm'

//     // let dist = usernameList.calcLevenDistance(user1, user2)

//     // console.debug(`Result is ${dist}`)
// }


// Declaring general functions
async function setupWorkerPool (workers=1) {
    // Setup scheduler and multiple OCR workers

    if (OCRScheduler == null)
        OCRScheduler = createScheduler()

    let promList = []
    while (numOCRWorkers < workers) {
        promList.push(addOCRWorker(numOCRWorkers++))
    }
    
    if (promList.length == 0) return Promise.resolve(true) // TODO: Worker list of something
    return Promise.any(promList)
}

async function shutdownWorkerPool () {
    // Terminate workers in scheduler
    return OCRScheduler.terminate()
    // TODO: Change this to just terminate some workers?
}


// Server processing functions
function startStreamMonitor(streamURL=null) {
    // Start process for stream url

    if (streamlinkProcess) return // TODO: Write error

    globalStreamURL ??= streamURL
    // streamlinkCmd[1] = streamURL


    console.debug(`Starting monitor in directory: ${process.cwd()}`)
    console.debug(`Watching stream url: ${streamlinkCmd[1]}`)

    streamlinkProcess = spawn(streamlinkCmd[0], streamlinkCmd.slice(1), {
        stdio: ['inherit', 'pipe', 'pipe']
    })
    ffmpegProcess = spawn(ffmpegCmd[0], ffmpegCmd.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe']
    })

    streamlinkProcess.stdout.pipe(ffmpegProcess.stdin) // pipe to ffmpeg

    
    // Print start/running depending on ffmpeg output
    if (debugProcess) {
        streamlinkProcess.stderr.on('data', (data) => {
            console.log(data.toString())
        })
    } else {
        let outputBuffer = false
        streamlinkProcess.stderr.on('data', (data) => {
            const stringOut = data.toString()
            if (!outputBuffer & stringOut.includes('Opening stream')) {
                outputBuffer = true
                console.debug('Streamlink is downloading stream-')
            }
        })
    }

    if (debugProcess) {
        ffmpegProcess.stderr.on('data', (data) => {
            console.log(data.toString())
        })
    } else {
        let outputBuffer = false
        ffmpegProcess.stderr.on('data', (data) => {
            const stringOut = data.toString()
            if (!outputBuffer & stringOut.includes('frame=')) {
                outputBuffer = true
                console.debug('FFMpeg is outputting images to buffer-')
            }
        })
    }

    ffmpegProcess.stdout.on('data', (partialPngBuffer) => {
        // NOTE: Data is a buffer with partial image data

        let lastIdx = 0
        let lead_idx = 0

        while (lead_idx+4 <  partialPngBuffer.length) {
            if (partialPngBuffer.readUInt32BE(lead_idx) == PNG_MAGIC_NUMBER) {
                // if (lead_idx % 4 != 0) console.error(`offset did not end at 0`)
                // console.debug(`Offset started at ${lead_idx} and ${lead_idx%4}`)

                if (lead_idx != lastIdx)
                    pngChunkBufferArr.push(partialPngBuffer.slice(lastIdx, lead_idx))

                if (pngChunkBufferArr.length > 0) {
                    // Buffer is complete, do effort
                    const pngBuffer = Buffer.concat(pngChunkBufferArr)
                    pngChunkBufferArr.length = 0 // clear array
                    // console.log(`Got PNG Buffer size:${pngBuffer.length}`)
                    // TODO: Debug flag
                    // fs.writeFileSync('process-stdout.png', pngBuffer, 
                    //     err => console.error(`You failed a thing ${err}`))
                    parseImgFile(pngBuffer)
                }

                lastIdx = lead_idx
            }
            lead_idx += 4
        }

        // copy remainder into here
        pngChunkBufferArr.push(partialPngBuffer.subarray(lastIdx)) // push shallow-copy of buffer here

    })

    streamlinkProcess.on('close', () => console.debug('Streamlink process has closed.'))
    ffmpegProcess.on('close', () => console.debug('FFMpeg process has closed.'))


    console.debug("Started up streamlink->ffmpeg buffer")
}

async function parseImgFile(imageLike) {
    // console.log("We're doing it LIVE!")
    // let filename = LIVE_FILENAME
    // let fileUpdateTs = fs.statSync(path.resolve(filename)).mtime.getTime()

    // // TODO: Wait until workerpool is ready
    

    // if (lastReadTs && lastReadTs == fileUpdateTs) {
    //     console.debug(`Already queued file with dt ${new Date(fileUpdateTs)}`)
    //     return
    // }
        
    // lastReadTs = fileUpdateTs
    serverStatus.imgs_downloaded += 1

    let currTs = (new Date()).getTime()
    
    const options = {
        "id": `file_dt_${currTs}`,
        "jobId": `file_dt_${currTs}`,
    }
    
    let mng = new MarbleNameGrabberNode(imageLike, false)

    console.debug(`Queuing LIVE image read ${OCRScheduler.getQueueLen()}`)

    return mng.buildBuffer()
    .catch( err => {
        console.warn("Buffer was not created successfully, skipping")
        throw err
    }).then( () =>  mng.isolateUserNames()
    ).then( buffer =>  scheduleTextRecogn(buffer)
    ).then( ({data, info}) => {
        // add to nameBuffer
        serverStatus.imgs_read += 1
        let retList = usernameList.addAll(data, mng.bufferToPNG(mng.buffer, true, false))
        console.debug(`UserList is now: ${usernameList.length}, last added: ${retList.at(-1)}`)
    }).catch ( err => {
        console.warn(`Error occurred ${err}, execution exited`)
        // Since this is continous, this info is discarded
    })
}

async function debugRun (filename) {
    console.log(`Running debug! ${filename}`)
    console.log(`Working directory: ${path.resolve()}`)
    
    await setupWorkerPool(1)

    let mng = new MarbleNameGrabberNode(filename, true)
    return mng.buildBuffer()
    .catch( err => {
        console.warn("Buffer was not created successfully, skipping")
        throw err
    })
    .then( () => mng.isolateUserNames()
    )
    .then( 
        buffer => scheduleTextRecogn(buffer)
    ).then(
        tsData => {
            return {mng: mng, data: tsData.data}
        }
    ).catch(
        err => {
            console.error(`Debug: An unknown error occurred ${err}`)
            throw err
        }
    )
}

// Tesseract.js
async function addOCRWorker (worker_num) {
    console.debug(`Creating Tesseract worker ${worker_num}`)

    const options = {}
    if (debugTesseract) {
        options["logger"] = msg => console.debug(msg)
        options["errorHandler"]  = msg => console.error(msg)
    }

    let tesseractWorker = await createWorker(options)
    await tesseractWorker.loadLanguage('eng')
    await tesseractWorker.initialize('eng');
    await tesseractWorker.setParameters({
        tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQKRSTUVWXYZ_0123456789', // only search a-z, _, 0-9
        preserve_interword_spaces: '0', // discard spaces between words
        tessedit_pageseg_mode: '6',      // read as vertical block of uniform text
        // tessedit_pageseg_mode: '11',      // read individual characters (this is more likely to drop lines)
    })

    console.debug(`Tesseract Worker ${worker_num} is built & init`)
    OCRScheduler.addWorker(tesseractWorker)
    return tesseractWorker

}

async function scheduleTextRecogn (imageLike, options) {
    // Create OCR job on scheduler
    if (!OCRScheduler) 
        throw Error('OCRScheduler is not init')
    return OCRScheduler.addJob('recognize', imageLike, options)
}

// ---------------------------------------------------------------
// Server part

server.use(express.json()) // for parsing application/json
server.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

server.get('/alive', (req, res) => {
    res.send('5alive');
})

// Admin functions

server.all('/start', (req, res) => {
    if (streamlinkProcess == null) {
        console.log("Starting up image parser...")
        
        usernameList.clear()
        setupWorkerPool(4)
        startStreamMonitor()
        serverStatus.started_stream_ts = new Date()
        // parserInterval = setInterval(parseImgFile, READ_IMG_TIMEOUT)
        serverState = SERVER_STATE_ENUM.RUNNING
        
        res.send({state: serverState, text:"Running"})
    } else {
        res.send({state: serverState, text:"Already Running"})
    }

})

server.all('/stop', (req, res) => {
    // if (parserInterval) {
    if (streamlinkProcess) {
        console.log("Stopping image parser")
        // TODO: Stop workers without killing the scheduler
        serverState = SERVER_STATE_ENUM.STOPPED

        streamlinkProcess.kill()
        ffmpegProcess.kill()
        // console.log("Killed streamlink processes")

        streamlinkProcess = null
        ffmpegProcess = null

        clearInterval(parserInterval)
        parserInterval = null
    }

    res.send({state: serverState, text:"Stopped"})
})

server.all('/clear/:pwd', (req, res) => {
    // force clear without resetting the server
    if (req.params.pwd == 'force') {
        usernameList.clear()
        res.send('Cleared userlist')
    } else {
        res.status(401).send('Not allowed.')
    }
})

server.all('/add', (req, res) => {
    let jsonList = req.body
    console.debug(`Body is ${jsonList.toString()}`)
    console.debug(`Adding ${jsonList["userList"].length} users`)
    for (let user in jsonList["userList"])
        usernameList.add(user, 101)
    return res.status(200).send('Added')
})


function humanReadableTimeDiff (milliseconds) {
    let seconds = parseInt(milliseconds / 1000)
    let minutes = parseInt(seconds / 60)
    seconds %= 60

    return `${minutes}m ${seconds}s`
}

server.all('/status', (req, res) => {
    res.send({
        'status': serverState,
        'job_queue': OCRScheduler.getQueueLen(),
        'img_stats': serverStatus,
        'streaming': humanReadableTimeDiff(Date.now() - serverStatus.started_stream_ts),
        'userList_length': usernameList.hash.size
    })
})


// User functions
server.get('/find/:userId', (req, res) => {
    // See if a user is in the system
    let reqUsername = req.params.userId
    console.debug(`Finding user ${reqUsername}`)
    return res.json(usernameList.find(reqUsername))
})

server.get(['/img/:userId'], (req, res) => {
    const reqUsername = req.params.userId
    console.debug(`Returning user image ${reqUsername}`)
    const userImage = usernameList.getImage(reqUsername)
    if (userImage) {
        res.contentType('jpeg')
        res.send(userImage)
    } else {
        res.sendStatus(404)
    }
})


server.get('/list', (req, res) => {

    // let iter = [...usernameList]
    
    res.send({
        len: usernameList.length,
        userList: [...usernameList.hash.entries()].map(  ([username, userObj]) => [username, userObj.confidence])
    })
})


server.get(['/debug'], 
(req, res) => {

    let filename = req.query?.filename
    if (!filename) filename = TEST_FILENAME

    debugRun(filename).then( ({mng, data}) => {
        let retList = usernameList.addAll(data, mng.bufferToPNG(mng.orig_buffer, true, false))
        res.send({list: retList, debug:true})
        console.debug("Sent debug response")
    }).catch( err => {
        res.status(400).send(`An unknown error occurred. ${err}`)
    })
})

server.listen(PORT, () => {
    console.log(`Server running at ${HOST}:${PORT}`)
})



// Debug code in here


// Working encode + decoder
// RUN THIS IN COMMAND PROMPT
// ffmpeg -i "C:\Users\MiloticMaster\Videos\MGS joke\barbCut_480.mp4" -f matroska pipe:1 | ffmpeg -f matroska -i pipe:0 output.mp4
// streamlink twitch.tv/barbarousking best --stdout | ffmpeg -f mpegts -i pipe:0 -vf fps=1 -y -update 1 testing/live.png

// VOD testing

// streamlink "https://www.twitch.tv/videos/1891700539?t=2h30m22s" best 
/* streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best
  streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best --stdout | ffmpeg -re -f mpegts -i pipe:0 -f image2 -pix_fmt rgba -vf fps=fps=1/2 -y -update 1 live.png
  
  streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best --stdout | ffmpeg -re -f mpegts -i pipe:0 -copyts -f image2 -pix_fmt rgba -vf fps=fps=1/2 -frame_pts true %d.png

  ffmpeg -re '-f','mpegts', '-i','pipe:0', '-f','image2', '-pix_fmt','rgba', '-vf','fps=fps=1/2', 'pipe:1'

  Explaining ffmpeg mysteries
    streamlink       = (program for natively downloading streams)
    <twitch-vod url> = se
    best             = streamlink quality option
    --stdout         = output stream to the stdout pipe

    ffmpeg
    -re = read at the native readrate (so realtime)
    -f mpegts = the input encoded pipe media format (for Twitch)
    -i pipe:0 = input is stdin (from previous pipe)
    -f image2 = use the image2 encoder (for files)
    -pix_fmt rgba = output png is rgba (32 bit depth)
    -vf         = video filters or something
        fps=fps=1/2 = create a screenshot 1/2 per second (2 times a second)
    -y          = do not confirm overwriting the output file
    -update     = continue to overwrite the output file/screenshot
    <screenshot.png> = output filename

    streamlink "https://twitch.tv/barbarousking" "best" --stdout | ffmpeg -re -f mpegts -i pipe:0 -f image2pipe -pix_fmt rgba -c:v png -vf fps=fps=1/2 pipe:1

    Explaining more commands
    -f image2pipe = if you pipe image2, its gets mad and crashes
    -c:v png    = video output is png
    pipe:1      = output to stdout
*/
