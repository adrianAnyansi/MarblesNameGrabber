# TODO.md

I always forget to do this and then I figure out how much easier life is
when you have a plan that you don't have to rewrite every 2 minutess

Here's the plan for MVP.

# MVP - Able to run on my local machine

## Text binarization 
0. Output each name boundary to an object; so another function can handle it
1. Flood-fill, mark valid px with a:254; on edges mark as a:253, other is a:0
2. create new buffer, copy px to gray scale while boosting values to black(max)
    debug: write buffer to text
    a. Add samples for mod, vip & streamer colors

## Buffer to OCR pipeline
3. Test tesseract with bin image
    tweak: for better output
4. Test tesseract with buffer
5. Link img process to tesseract path
6. Test run with vod output + timing

## Run as server
7. Build server components + memory database
8. Create child process for streamlink
9. Build routes
10. Test server to run independently

11. Start building webpage and UI
12. Attach server to 