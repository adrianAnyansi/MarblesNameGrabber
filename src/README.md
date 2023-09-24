# Marbles Names OCR

This project is intended to recognize names for Barbarous Marble's Races.

Although it's public source, it's mostly configured for Twitch & Barb's stream so some tweaking is necessary if using a different setup.

# Underlying OCR logic

Simple: Streamlink -> FFMpeg.
- Streamlink outputs a stream using the mpegts format. I'm using streamlink auth to ignore ads. (Im subbed)
- FFMpeg ingests the stream and outputs N images per second. All images are sent to OCR
    - Minor note: PNG buffer stacks up until it meets the PNG magic number, then sends that buffer to OCR.

- MarblesNameGrabberNode then searches image and retrieves each text corresponding to usernames.
    Simplified logic is:
    - Search from right to left
    - Tag a pixel that's within the range of colours for valid usernames
    - Flood fill while continuing to move left
    - Exclude: flood-fill outside username range, pixels not in 1st matched colour
    - Colour balance valid pixels to black & white; copy to new buffer

- Tesseract takes the binarized output and returns the found text.
- Text is ingested into UsernameTrackerClass for sorting & finding to the server.

# Server/State logic
Not gonna say too much on this

1. On startup, server monitors twitch channel name (uses broadcaster id NOT channel_link) until it switches to Marbles On Stream
2. WAITING - Server starts downloading and checks stream images for the Marbles Pre-Race UI. (/start also does this)
3. READING - Server finds Pre-Race UI, starts reading the names
4. COMPLETE - Server found N (20) frames without any names, and has shutdown the streamlink & etc.
5. STOPPED - Same as COMPLETE, no processes are active. 

# Architecture

Server is written in Node.js on Express.
The program was a manual mode that runs on a mid-sized machine.
    Setting USE_LAMBDA=false will have the Tesseract scheduler build workers on your machine.
My machine could run real-time with about 6 workers at FPS=2.

Online version requires too much CPU for a program that runs maybe once per week, so I have a lambda function.
The lambda code is not public; but it's really just: 
    global tesseract worker (to cache worker init), then run MNG code on a base64 image.
    Some fancy stuff to reduce the output to important data
The lambda function is not public (for obvious reasons) so it's not available either.
Currently online can run near real-time with 12 lambda functions at FPS=2
Cause the lambda best case takes 900-1600ms and has to base64 encode and network transfer, it will always be around 1s behind.
