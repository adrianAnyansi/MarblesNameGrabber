// Unittesting here

import { UserNameBinarization } from "./UserNameBinarization.mjs";
import { Color, ImageBuffer, SharpImg } from "./UtilModule.mjs";
import sharp from 'sharp'

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
    let mng = new UserNameBinarization(filename, true);
    
    const boundingStart = performance.now()
    await mng.getUNBoundingBox();
    console.log("Finished line detection in "+ (performance.now()-boundingStart)+'ms')
}

async function test_chat_detect() {
    const filename = curatedFolder+'91.png'
    let mng = new UserNameBinarization(filename, true);

    const {data, info} = await sharp(filename).ensureAlpha().raw().toBuffer( { resolveWithObject: true })
    const imgBuffer = new ImageBuffer(data, info.width, info.height, info.channels)

    mng.verifyChatBlockingNames(imgBuffer)
}

async function old_bin() {
    const filename = chatTestingFolder+'chat_t2 (7).png'
    
    let imageLike = await sharp(filename).ensureAlpha().png().toBuffer()
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
    sharpImg.toBuffer(false, fileObj).toFile(testingFolder+'test_buffer'+file_ext)

    // Red pixel should show
}

// TESTING HERE
(async () => {

    // await test_userbox();
    // await test_line_test();
    
    // await test_chat_detect();
    // await old_bin();

    await objectTest();
    
    // Done! Print success
    console.log("Success! Everything looks good!")
})();