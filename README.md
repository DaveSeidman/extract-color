# Color Extractor

Simple module to extract the "average" color from an image a la https://manu.ninja/dominant-colors-for-lazy-loading-images

Currently trying two different methods, one using graphicsmagick and another with Canvas.

To train, fill the training/images folder with images that correspond to the colors you want to classify.

Then run `node index --train`

This will average all the images color estimates into a color.json file which will later be used to classify images.

---

To classify an image, run `node index --image=path/to/image.jpg`

They're both fairly successful at guessing colors though both methods struggle with white objects, might need to split off to a different algorithm if overall color contrast is low.
