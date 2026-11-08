# Colab exporter

Open `VinylPlayer_Export.ipynb` in Google Colab. It uses native FFmpeg rather than browser FFmpeg WASM, so long exports do not require the browser to hold every frame in memory.

The notebook is intended as a strong first export workflow. For five-hour jobs, mount Google Drive and write the result there instead of keeping the finished file only in the browser download buffer.
