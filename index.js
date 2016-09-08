var gm = require('gm'),
    Canvas = require('canvas'),
    fs = require('fs'),
    argv = require('yargs').argv,
    colors = require('./colors.json');

var USE_CANVAS = false,
    SAMPLES = 512,
    CROP_SIZE = 200,
    CT_THRESHOLD = 40,
    IMG_WIDTH = 1024,
    IMG_HEIGHT = 768;


var trainingImages = [
    'training/images/blue/',
    'training/images/green/',
    'training/images/lavendar/',
    'training/images/lime/',
    'training/images/orange/',
    'training/images/purple/',
    'training/images/red/',
    'training/images/white/',
    'training/images/yellow/'
];


module.exports = (function() {

	var module = { }

    module.init = () => {

        // user is training the program
        if(argv.train) {

            module.train();
            return;
        }

        // user provided image, classify it
        if(argv.image) {
            // make sure training has been run
            if(colors.length) {
                if(USE_CANVAS) {
                    module.cvAvgColor(argv.image)
                    .then(module.findClosest);
                }
                else {

                    var startTime = new Date();
                    module.gmAvgColor(argv.image).then(result => {

                        var closest = module.findClosest(result),
                            duration = (new Date() - startTime)/1000;
                        console.log("closest match:", closest.color, "\nconfidence:", closest.confidence, "\nduration:", duration, "seconds");
                    });
                }
            }
            else {
                console.log("colors not specified, please run in training mode: \nnode index --train");
                return;
            }
        }
        else {
            console.log("image not specified, please run with --image argument: \nnode index --image=path/to/image.jpg");
        }

    }

    // train the program on a list of a folders specified by trainingImages
    module.train = () => {

        var getFiles = trainingImages.map(module.trainFolder),
            allColors = Promise.all(getFiles),
            startTime = new Date();

        allColors.then(results => {

            var duration = new Date() - startTime;
            console.log("all colors calculated, training took", duration/100, "seconds");
            fs.writeFileSync('./colors.json', JSON.stringify(results, null, 4));
            console.log("wrote results colors.json");
        });
    }

    // train the program for all images in specified folder
    module.trainFolder = (folder) => {

        return new Promise((resolve, reject) => {
            // get all the images for this color
            var files = undefined;
            try { files = fs.readdirSync(__dirname + '/' + folder); }
            catch (err) { console.log("error reading from", folder); }

            if(files) { // training images found for this color

                // prepend directory to filenames
                for(var i = 0; i < files.length; i++) files[i] = folder + files[i];

                // get the average color for each image
                var getColors = files.map(module.gmAvgColor),
                    avgColor = Promise.all(getColors);;
                    //colorName =

                avgColor.then(results => {

                    var colorName = folder.split('/'),
                        colorName = colorName[colorName.length-2],
                        colorRGB = module.average(results),
                        colorHex = module.rgbToHex(colorRGB[0], colorRGB[1], colorRGB[2]);
                    //console.log("average for", folder, "=", module.average(results));
                    resolve({ color: colorName, rgb: colorRGB, hex:colorHex  } );
                });
            }
        });
    }


    // use canvas to crop, and sample colors from [SAMPLES] random points in the image
    module.cvAvgColor = (image) => {

        //return new Promise((resolve, reject) => {

        var Image = Canvas.Image;
        var canvas = new Canvas(1024, 768);
        var ctx = canvas.getContext('2d');

        var file = undefined;
        try { file = fs.readFileSync(__dirname + '/' + image) }
        catch (err) { console.log("error reading file", image); }

        if(file) {

            img = new Image;
            img.src = file;
            ctx.drawImage(img,0,0);
            // consider adding a blur function here, though it might slow things down too much

            var rd = 0;
            var gr = 0;
            var bl = 0;
            for(var i = 0; i < SAMPLES; i++) {

                var pointColor = ctx.getImageData(
                                        Math.floor((IMG_WIDTH/2 - 200) + Math.random() * 400),
                                        Math.floor((IMG_HEIGHT/2 - 200) + Math.random() * 400),
                                        1,
                                        1).data;

                // throw out values with low contrast.
                if(module.contrast([pointColor[0],pointColor[1],pointColor[2]]) > CT_THRESHOLD) {
                    rd += pointColor[0];
                    gr += pointColor[1];
                    bl += pointColor[2];
                }
                else {
                    i--;
                }
            }

            var color = [
                Math.round(rd / SAMPLES),
                Math.round(gr / SAMPLES),
                Math.round(bl / SAMPLES)];

            console.log("extracted average color", color, "using", SAMPLES, "Sample points");
            return(color);
        }
        //});

    }


    // use graphicsmagick to crop, resize, and average the color data of the provided image
    module.gmAvgColor = (image) => {

        return new Promise((resolve, reject) => {

            gm(image)                   // process image with graphicsmagick
            .crop(CROP_SIZE,CROP_SIZE,(IMG_WIDTH - CROP_SIZE)/2,(IMG_HEIGHT - CROP_SIZE)/2)      // crop out a 400x400 squre from the middle of the image
            //.resize(100, 100)           // resize to speed up the next operations
            .colors(1)                  // extract color
            .toBuffer('RGB', function (error, buffer) {

                if(buffer) {

                    // split and convert to decimal array
                    var hexArray = buffer.slice(0,3).toString('hex').match(/../g),
                        color = [
                        parseInt(hexArray[0], 16),
                        parseInt(hexArray[1], 16),
                        parseInt(hexArray[2], 16)];

                    resolve(color);
                }
                else {

                    console.log("could not find image", image ); //
                    reject();
                }
            });
        });
    }

    // iterate through color array to find closest match
    module.findClosest = (match) => {

        var closestOffset = 256 * 3;
        var closestColor;
        var conf;

        for (var i = 0; i < colors.length; i++) {

            var diff =  Math.abs(match[0] - colors[i].rgb[0]) +
                        Math.abs(match[1] - colors[i].rgb[1]) +
                        Math.abs(match[2] - colors[i].rgb[2]);

            if(diff < closestOffset) {

                conf = closestOffset - diff;
                closestOffset = diff;
                closestColor = colors[i];
            }
        }

        return({ color:closestColor.color, confidence:conf });
    }

    // check contrast
    module.contrast = (color) => {

        var avg = (color[0] + color[1] + color[2])/3;

        var offset = Math.abs(color[0] - avg) +
                     Math.abs(color[1] - avg) +
                     Math.abs(color[2] - avg)

        return offset;
    }

    // take an array of [r,g,b] values and return the average
    module.average = (arrayOfColors) => {

        var totalColor = [0,0,0],
            averageColor = [];


        for(var i = 0; i < arrayOfColors.length; i++) {

            totalColor[0] += arrayOfColors[i][0];
            totalColor[1] += arrayOfColors[i][1];
            totalColor[2] += arrayOfColors[i][2];
        }

        averageColor[0] = Math.round(totalColor[0] / arrayOfColors.length);
        averageColor[1] = Math.round(totalColor[1] / arrayOfColors.length);
        averageColor[2] = Math.round(totalColor[2] / arrayOfColors.length);

        return averageColor;
    }

    // get hex values
    module.componentToHex = (c) => {

        var hex = c.toString(16);
        return hex.length == 1 ? "0" + hex : hex;
    }

    module.rgbToHex = (r,g,b)  => {

        return "#" + module.componentToHex(r) + module.componentToHex(g) + module.componentToHex(b);
    }

    module.init();
	return module;

})();
