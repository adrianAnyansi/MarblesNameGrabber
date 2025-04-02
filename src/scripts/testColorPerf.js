

// performance timing

import { Color } from "../UtilModule.mjs"

function makeRandomColor () {
    return Uint8Array.from([
        Math.round(Math.random() * 256),
        Math.round(Math.random() * 256),
        Math.round(Math.random() * 256)
    ])
}

const testArr = []
let start = performance.now()
for (let i of Array(1_000_000)) {
    testArr.push(makeRandomColor())
}
console.log(`Control: Finished in ${performance.now() - start}ms`)

start = performance.now()
for (let color of testArr) {
    Color.hashRGB(color)
}
console.log(`Hash-concat: Finished in ${performance.now() - start}ms`)


start = performance.now()
for (let color of testArr) {
    Color.toHex(color)
}
console.log(`Hex num: Finished in ${performance.now() - start}ms`)

start = performance.now()
for (let color of testArr) {
    color.toString()
}
console.log(`Native tostring: Finished in ${performance.now() - start}ms`)

start = performance.now()
for (let color of testArr) {
    color[0] * 100 + color[1] * 10 + color[2]
}
console.log(`Multiply: Finished in ${performance.now() - start}ms`)