# Python Foundations Lab

An introduction to Python that runs entirely in the browser: short notes, editable code cells, quick questions and labs that check your answers. Nothing to install.

**Live site:** https://python-lab-site-alpha.vercel.app

## Found a problem?

[Open an issue](https://github.com/hamsathul/python-lab-site/issues). Say which session and which example or lab, what you ran, and what you expected to see.

## How it works

- `index.html` holds the course content and the app. Progress and lab drafts are saved in the visitor's browser only.
- Code runs in real Python (CPython 3.13) through [Pyodide](https://pyodide.org) 0.29.5, loaded from jsDelivr into a Web Worker (`py-worker.js`). A run that takes longer than 10 seconds is stopped and Python restarts. NumPy loads the first time it's imported.

## Run locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from disk won't work, because the Python worker has to be served over HTTP.
