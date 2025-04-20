// Jest unittest for binarization

import {test, expect} from '@jest/globals'
import { UserNameBinarization } from "../UsernameBinarization.mjs";


const curatedFolder = String.raw`testing\curated\\`;
const chatTestingFolder = String.raw`testing\chat_testing\\`;
const testingFolder = String.raw`testing\\`;
const vodTestingFolder = String.raw`testing\\vod_dump\\%s.jpg`

const page = 303;
const user = 4;

function getFilename(folder, page) {
    return folder.replace('%s', page)
}

test("Test userbox appear & length check",
    async () => {
        // const pgExp = (string, pageExp) => `${}`
        // const filename =  `testing/vod_dump/${page}.jpg`
        const filename = getFilename(vodTestingFolder, page)
        const debug = true

        const mng = new UserNameBinarization(filename, debug);
        const users = await mng.getUNBoundingBox(null, {appear:true, length:true});
    }
)