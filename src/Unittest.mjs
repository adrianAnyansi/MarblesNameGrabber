// Unittesting here

import { UserNameBinarization } from "./UserNameBinarization.mjs";
import sharp from 'sharp'

async function test_line_test() {

    const filename = String.raw`C:\Users\Tobe\Documents\Github\MarblesNameGrabber\testing\quality_testing\streamlink_vod_snapsnot.png`;

    let mng = new UserNameBinarization(filename, true);

    const {data, info} = await sharp(mng.imageLike).raw().toBuffer( { resolveWithObject: true })
    let x = 1400
    let y = 585
    let ret = await mng.checkLine(x, y, data, info, 1, true)
    console.log(`For (${x},${y}) -> ${ret}`)
}

async function test_userbox() {

    const filename = String.raw`C:\Users\Tobe\Documents\Github\MarblesNameGrabber\testing\quality_testing\streamlink_vod_snapsnot.png`;
    let mng = new UserNameBinarization(filename, true);

    await mng.getUNBoundingBox();
    console.log("Finished line detection")
}

// TESTING HERE
(async () => {

    await test_userbox();
    // await test_line_test();
    
    // Done! Print success
    console.log("Success! Everything looks good!")
})();