// Lambda standalone

import { UserNameBinarization } from './UserNameBinarization.mjs'
import { createWorker } from 'tesseract.js'
import {spawn} from 'node:child_process'

let globalWorker = null
const debugTesseract = false

const WORKER_RECOGNIZE_PARAMS = {
    blocks:true, hocr:false, text:false, tsv:false
}

async function buildWorker() {

    if (globalWorker) return globalWorker
    console.debug(`Creating Tesseract worker`)

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
    console.debug('Tesseract worker is built')
    globalWorker = tesseractWorker
    return tesseractWorker
}

const USED_VARIABLES = ['text', 'words', 'confidence', 'bbox']

function cleanTesseractOutput (data) {
    const retVal = {"lines": []}
    for (let line of data.lines) {
        let newLine = {}
        // Using text, words[0], confidence, bbox
        for (let field of USED_VARIABLES) {
            newLine[field] = line[field]
        }
        retVal["lines"].push(newLine)
    }

    return retVal
}

const TESSERACT_LOC = "tesseract"
const tesseractLinkCmd = [ 
    // String.raw`C:\Users\Tobe\Documents\Github\MarblesNameGrabber\testing\name_bin.png`, '-', // stdin, stdout
    "-", "-",
    "--psm", "4",
    "-l", "eng",
    "-c", "preserve_interword_spaces=1",
    "-c", "tessedit_char_whitelist=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQKRSTUVWXYZ_0123456789",
    "-c", "hocr_char_boxes=1",
    "-c", "tessedit_create_hocr=1"
]

/**
 * @param {Buffer} imgBinBuffer
 * @returns {Promise<>} HOCR xml output
 * Native tesseract process */
async function nativeTesseractProcess(imgBinBuffer) {
    // console.debug(`Running native Tesseract process`)
    const tessProcess = spawn(TESSERACT_LOC, tesseractLinkCmd, {
        stdio: ["pipe", "pipe", "pipe"]
    })          //stdin //stdout //stderr

    tessProcess.stderr.on('data', (data) => {
        console.error("Tesseract [ERR]:", data.toString())
    })
    
    let resolve, reject;
    const retPromise = new Promise((res, rej) => {
        resolve = res;
        reject = rej
    });

    
    tessProcess.on('close', () => {
        // console.warn(`Tesseract closed rn`)
        reject()
    })

    /** hocr text collected here */
    let outputText = ""

    tessProcess.stdout.on('data', (buffer) => {
        outputText += buffer.toString();
    });

    tessProcess.stdout.on('end', () => {
        // This should be the XML format HOCR
        // just return raw text
        resolve({
            raw: outputText,
            info:"TF is this object for idk"
        })
    })

    tessProcess.on('error', err => {
        console.warn(`Tesseract Err ${err}`)
        reject()
    })
    
    // put the binarized image to stdin
    tessProcess.stdin.end(imgBinBuffer
        // (err) => {
        //     console.debug("Tesseract bin buffer has been written")
        // }
    );
    // tessProcess.stdin.end()

    return retPromise
}

/** Helper func to switch between  */
async function recognizeImage(imageLike) {

    if (USE_NATIVE) {
        console.debug("using Native Tesseract")
        return nativeTesseractProcess(imageLike)
    }

    // else do worker
    return buildWorker()
    .then( worker => worker.recognize(imageLike, {}, WORKER_RECOGNIZE_PARAMS))
    .then( ({data, info}) => {
        //  Save and return result
        return {  'data':cleanTesseractOutput(data), 'info':info }       
    })
}

const USE_NATIVE = true

export const handler = async function parseImgFile(event, context) {
    
    console.log("Lamdba Severless startup")
    const imageLike = Buffer.from(event.buffer, 'base64') // rebuild image from base64
    const jobId = event.jobId

    let retVal = null
    
    // Debug testing
    if (event?.test) {
        console.debug('Got debug image, sending straight to worker')
        retVal = await recognizeImage(imageLike)
        console.debug('Returning debug result')
        return retVal
    // Warm up testing
    } else if (event?.warmup) {
        console.debug("Warmup code, setup worker and exit")
        await buildWorker();
        return {'warmup': true}
    }

    // LIVE-CODE
    console.debug(`Processing LIVE image, jobId ${jobId}`)

    let mng = new UserNameBinarization(null, false)
    const imgMetadata = event.imgMetadata
    const info = event.info

    retVal = await mng.quickBuffer(imageLike, imgMetadata, info)
    .catch( err => {
        console.error("Buffer was not created successfully, skipping")
        throw err
    }).then( () =>  {
        console.debug('Isolating names'); 
        return mng.isolateUserNames() // convert buffer to binizarized
    }).then( buffer =>  {
        console.debug('Recognizing names');
        recognizeImage(buffer)
    }).catch ( err => {
        console.error(`Error occurred during imageParse ${err}, execution exited`)
        throw err // Raise error for result
    })

    console.debug('Returning result')
    retVal['jobId'] = jobId
    return retVal
    
}