// Lambda standalone

import { MarbleNameGrabberNode } from './MarblesNameGrabberNode.mjs'
import { createWorker } from 'tesseract.js'

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

export const handler = async function parseImgFile(event, context) {
    
    console.log("Lamdba Severless startup")
    const imageLike = Buffer.from(event.buffer, 'base64')
    const jobId = event.jobId

    let tesseractPromise = buildWorker()

    let retVal = null
    
    // Debug testing
    if (event?.test) {
        console.debug('Got debug image, sending straight to worker')
        await tesseractPromise
        .then( worker => worker.recognize(imageLike, {}, WORKER_RECOGNIZE_PARAMS))
        .then( ({data, info}) => {
            retVal = {  'data':cleanTesseractOutput(data), 'info':info, 'jobId': jobId }       //  Save and return result
        })
        console.debug('Returning debug result')
        return retVal

    } else if (event?.warmup) {
        console.debug("Warmup code, setup worker and exit")
        await tesseractPromise
        return {'warmup': true}
    }

    // LIVE-CODE
    console.debug(`Processing LIVE image, jobId ${jobId}`)

    let mng = new MarbleNameGrabberNode(null, false)
    const imgMetadata = event.imgMetadata
    const info = event.info

    await mng.quickBuffer(imageLike, imgMetadata, info)
    .catch( err => {
        console.error("Buffer was not created successfully, skipping")
        throw err
    }).then( () =>  {console.debug('Isolating names'); return mng.isolateUserNames()} // convert buffer to binizarized
    ).then( buffer =>  {console.debug('Recognizing names'); return tesseractPromise.then( worker => worker.recognize(buffer, {}, WORKER_RECOGNIZE_PARAMS))} // resolve promise and read buffer
    ).then( ({data, info}) => {
        retVal = {  'data':cleanTesseractOutput(data), 'info':info, 'jobId': jobId }       //  Save and return result
    }).catch ( err => {
        console.error(`Error occurred during imageParse ${err}, execution exited`)
        throw err // Raise error for result
    })

    console.debug('Returning result')
    return retVal
    
}