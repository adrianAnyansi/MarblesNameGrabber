// Unittesting here

import { msToHUnits } from "./DataStructureModule.mjs";
import { MarblesAppServer } from "./MarblesAppServer.mjs";
import { ColorSpace, UserNameBinarization } from "./UserNameBinarization.mjs";
import { Color, ImageBuffer, Mathy, SharpImg } from "./UtilModule.mjs";
import sharp from 'sharp'
import fs from 'fs'
import {resolve} from 'node:path'

const file1 = String.raw`testing\line_test\streamlink_vod_snapsnot.png`;

const lineTestFolder = String.raw`testing\line_test\\`;
const file2 = lineTestFolder+String.raw`light_bg_line_test.png`;

const curatedFolder = String.raw`testing\curated\\`;
const chatTestingFolder = String.raw`testing\chat_testing\\`;
const testingFolder = String.raw`testing\\`;

async function test_line_test() {

    const filename = String.raw`testing\line_test\streamlink_vod_snapsnot.png`;

    let mng = new UserNameBinarization(filename, true);

    const {data, info} = await sharp(mng.imageLike).raw().toBuffer( { resolveWithObject: true })
    let x = 1400
    let y = 585
    let ret = mng.checkLine(x, y, data, info, 1, true)
    console.log(`For (${x},${y}) -> ${ret}`)
}

async function test_userbox() {

    // const filename = lineTestFolder+'chat_test.png';
    const filename = file2;
    // const filename = chatTestingFolder+'chat_clean.png';
    let mng = new UserNameBinarization(filename, true);
    
    const boundingStart = performance.now()
    await mng.getUNBoundingBox();
    console.log("Finished line detection in "+ (performance.now()-boundingStart)+'ms')
}

async function test_userbox_appear_n_len(inpage) {
    // const filename = file2;
    const page = inpage ?? 471
    const filename = `testing/vod_dump/${page}.png`

    const mng = new UserNameBinarization(filename, true);
    performance.mark('s')
    let users = await mng.getUNBoundingBox([], {appear:true, length:true});
    console.log("Users List")
    console.log(users.map((u, i) => 
        `[${i.toString().padStart(2, ' ')}] ${JSON.stringify(u)}`
    ).join('\n'))
}

async function test_chat_detect() {
    const filename = curatedFolder+'91.png'
    let mng = new UserNameBinarization(filename, true);

    const {data, info} = await sharp(filename).ensureAlpha().raw().toBuffer( { resolveWithObject: true })
    const imgBuffer = new ImageBuffer(data, info.width, info.height, info.channels)

    mng.verifyChatBlockingNames(imgBuffer)
}

async function old_bin() {
    // const filename = chatTestingFolder+'chat_t2 (7).png'
    
    // const filename = chatTestingFolder+'chat_t (4).png'
    const page = 471
    const file2 = `testing/vod_dump/${page}.png`
    
    let imageLike = await sharp(file2).ensureAlpha().png().toBuffer()
    let mng = new UserNameBinarization(imageLike, true);
    mng.buildBuffer()
    mng.isolateUserNames()
}

async function objectTest () {
    const filename = chatTestingFolder+'chat_t2 (7).png'

    let sharpImg = new SharpImg(filename)
    let buffer = await sharpImg.buildBuffer()
    
    buffer.setPixel(10, 10, Color.RED)

    let [fileObj, file_ext] = [{toPNG:true}, '.png']
    sharpImg.toSharp(false, fileObj).toFile(testingFolder+'test_buffer'+file_ext)

    // Red pixel should show in the top-left corner
}

async function userCountTest() {

    const filename = chatTestingFolder+'chat_t (4).png'
    // const filename = testingFolder+'black_text_test.png'
    // let sharpImg = new SharpImg(filename).crop({x:191, y:9, w:107, h:28})
    let sharpImg = new SharpImg(filename)
    let buffer = await sharpImg.buildBuffer()
    let imgBuffer = await sharpImg.toSharp(true, {toPNG:true}).toBuffer()
    // sharpImg.toSharp(true, {toPNG:true}).toFile('test.png')

    const mas = new MarblesAppServer()
    let start = performance.now()
    let output = await mas.nativeTesseractProcess(imgBuffer)
    let time = msToHUnits(performance.now() - start)
    console.log(`Detect took ${time}, Ouput: ${output.data}`)
    console.log(output.data)

}

async function numberRead() {
    const filename = testingFolder+'full_userct.png'

    let imgBuffer = await new SharpImg(filename).buildBuffer()

    let outBuffer = imgBuffer.cloneDims() // output clone buffer
    let mng = new UserNameBinarization() // only using colorspace functionality, should move this
    
    const COLORSPACE_JSON = JSON.parse(fs.readFileSync(resolve("data/colorspace.json"), 'utf8'))
    const WHITE_COLORSPACE = ColorSpace.Import(COLORSPACE_JSON.WHITE)

    let whitePxLine = []
    buffer: for (let x=0; x<imgBuffer.width; x++) {
        let whiteDetected = false;
        for (let y=0; y<imgBuffer.height; y++) {
            const isWhite = WHITE_COLORSPACE.check(imgBuffer.getPixel(x,y));
            if (isWhite) {
                outBuffer.setPixel(x,y, Color.BLACK)
                whiteDetected = true
            }
            // TODO: Gotta flood fill again, the actual 
        }
        whitePxLine.push(whiteDetected)
        if (whitePxLine.at(-1) == false && whitePxLine.at(-2) == true){
            // detect TRUE,FALSE at the end of detection
            break buffer
        }
    }

    new SharpImg(null, outBuffer).toSharp(false, {toPNG:true}).toFile(testingFolder+'oneLet.png')
}
 function math_range_check () {

    Mathy.inRange(5, 5, 0);
    Mathy.inRange(3, 5, [-3,3]);
}

async function test_userbox_cropnbin(inpage, inuser) {
    const page = inpage ?? 710;
    const user = inuser ?? 10;
    const filename = `testing/vod_dump/${page}.png`

    const mng = new UserNameBinarization(filename, true);
    performance.mark('s')
    let users = await mng.getUNBoundingBox([user], {appear:true, length:true})
    const userObj = users[user]
    
    // crop image
    const userCropImg = await mng.cropTrackedUserName(user, userObj.length)
    userCropImg.toSharp(null, {toPNG:true}).toFile(`testing/indv_user_crop.png`)
    
    // bin image
    const binUserImg = await mng.binTrackedUserName([userCropImg])
    new SharpImg(null, binUserImg).toSharp(true, {toPNG:true}).toFile(`testing/indv_user_bin.png`)
}

async function test_colorspace_rot() {

    const point = [115,145,245]

    console.log("in range", 
        ColorSpace.COLORS.SUB_BLUE.check(point))
}

// TESTING HERE
(async () => {

    // math_range_check()

    // await test_userbox();
    // await test_userbox_appear_n_len();
    // await test_line_test();
    
    // await test_chat_detect();
    // await old_bin();

    // await objectTest();
    // await userCountTest();
    
    // await numberRead();

    // await test_userbox_cropnbin();

    // test_colorspace_rot();


    // new bin check
    const page = 318;
    await test_userbox_appear_n_len(page)
    // await test_userbox_cropnbin(page, 10)
    
    // Done! Print success
    console.log("Success! Everything looks good!")
})();