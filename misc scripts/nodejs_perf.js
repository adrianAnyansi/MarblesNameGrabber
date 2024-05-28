import sharp from "sharp";


async function main () {

    /** @type Buffer */
    let outBuffer = null;
    let bufferInfo = null;
    let inBuffer = null;

    const documentFolder = process.env.USERPROFILE;
    
    const rotation = makeRotation(0, 123.0, 147.0);
    await sharp(String.raw`${documentFolder}\Documents\Github\MarblesNameGrabberRust\test_image.png`)
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then( ({data, info}) => {
            outBuffer = Buffer.alloc(info.size);
            inBuffer = data;
            bufferInfo = info;
        } );

    let start_dt = Date.now();
    console.log(`[Node] Pixel test start ${start_dt}`);

    for (let i=0; i<1; i++) {
        await imageTest(inBuffer, bufferInfo, outBuffer, rotation);
        console.log(`Pixel test ${i} complete`)
    }

    const dur = Date.now() - start_dt;

    sharp(outBuffer, {
        raw: { width: bufferInfo.width,
                height: bufferInfo.height,
                channels: bufferInfo.channels,
                premultiplied: bufferInfo.premultiplied
        }
    }).png()
    .toFile(String.raw`${documentFolder}\Documents\Github\MarblesNameGrabberRust\node_out_image.png`);

    console.log(`Pixel test ended by ${(dur)}ms or ${dur/1000}s`)
}

async function imageRead () {
    
    await sharp(`C:\\Users\\Tobe\\Documents\\Github\\MarblesNameGrabberRust\\test_image.png`)
    .raw()
    .toBuffer( {resolveWithObject: true} )
    .then(  ({data, info}) => {
            let whitePixels = 0;
            let pixelTotal = 0;
        
            let px_offset = 0;
            while (px_offset + info.channels <= data.length) {
                const rg = data.readUInt16LE(px_offset);
                const b = data.readUIntLE(px_offset+2, 1);
                const int8mask = 0xFF;

                const px_sum = (rg & int8mask) + ((rg >> 8*1) & int8mask) + b;
                pixelTotal += 1;
                if (px_sum > 735) whitePixels += 1 
                px_offset += info.channels;
            }

            // console.log(`Pixels that matched are ${whitePixels} and total was ${pixelTotal}`);
        }
    )
}

async function imageTest (inBuffer, bufferInfo, outBuffer,  rotation) {
    let px_offset = 0;
    const int8mask = 0xFF;
    const point = [0,0,0]

    while (px_offset + bufferInfo.channels <= inBuffer.length) {
        const rgba = inBuffer.readUInt32LE(px_offset);

        const rgb = [(rgba & int8mask), ((rgba >> 8*1) & int8mask), (rgba >> 8*2) & int8mask];
        // const rgb = [inBuffer.readUInt8(px_offset), 
        //             inBuffer.readUInt8(px_offset+1), 
        //             inBuffer.readUInt8(px_offset+2)]
        point[0] = rgb[0];
        point[1] = rgb[1];
        point[2] = rgb[2];

        if (checkInBox(point, rotation)) {
            outBuffer.writeUInt32LE((rgba | 0xFF000000) >>> 0, px_offset)
        }

        px_offset += bufferInfo.channels;
    }
}


const C_POINT = [120.0, 138.0, 235.0];
const SCALE = [83.0/2.0, 55.0/2.0, 82.0/2.0];

function checkInBox(point, rotation) {

    point[0] -= C_POINT[0]
    point[1] -= C_POINT[1]
    point[2] -= C_POINT[2]

    let rot_point = rotatePoint(...rotation, point);

    return rot_point[0] < SCALE[0] && rot_point[0] > -SCALE[0] && 
        rot_point[1] < SCALE[1] && rot_point[1] > -SCALE[1] && 
        rot_point[2] < SCALE[2] && rot_point[2] > -SCALE[2];
}

function makeRotation(pitch, roll, yaw) {
    let cosa = Math.cos(yaw);
    let sina = Math.sin(yaw);

    let cosb = Math.cos(pitch);
    let sinb = Math.sin(pitch);

    let cosc = Math.cos(roll);
    let sinc = Math.sin(roll);

    let Axx = cosa*cosb;
    let Axy = cosa*sinb*sinc - sina*cosc;
    let Axz = cosa*sinb*cosc + sina*sinc;

    let Ayx = sina*cosb;
    let Ayy = sina*sinb*sinc + cosa*cosc;
    let Ayz = sina*sinb*cosc - cosa*sinc;

    let Azx = -sinb;
    let Azy = cosb*sinc;
    let Azz = cosb*cosc;

    return [[Axx, Axy, Axz], [Ayx, Ayy, Ayz], [Azx, Azy, Azz]];
}

function rotatePoint(rotx, roty, rotz, point) {

    const px = point[0]
    const py = point[1]
    const pz = point[2]

    point[0] = rotx[0]*px + rotx[1]*py + rotx[2]*pz;
    point[1] = roty[0]*px + roty[1]*py + roty[2]*pz;
    point[2] = rotz[0]*px + rotz[1]*py + rotz[2]*pz;

    return point
}

main()