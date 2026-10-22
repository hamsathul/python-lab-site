// Runs learner code with Pyodide (CPython compiled to WebAssembly) off the page's main thread,
// so the page can stop a stuck loop by terminating this worker and starting a fresh one.
var PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/";
importScripts(PYODIDE + "pyodide.js");

// _run(src, inputs_json) -> JSON list of {t, s} chunks: t is out | err | prompt | in | val | note.
// Errors keep only the learner's own lines ("Line 3, in add()") and carry a one-line `short` form for lab checks.
var RUNNER = String.raw`
import builtins, json, linecache, sys, traceback
from pyodide.code import eval_code

MAX_LINES = 3000

class _TooMuchOutput(BaseException):
    pass

def _explain(e):
    te = traceback.TracebackException.from_exception(e)
    frames = [f for f in te.stack if f.filename == "<cell>"]
    if len(frames) > 8:
        frames = frames[:3] + [len(frames) - 6] + frames[-3:]
    lines = []
    if frames:
        lines.append("Traceback (most recent call last):")
        for f in frames:
            if isinstance(f, int):
                lines.append("  ... %d more calls like these ..." % f)
                continue
            lines.append("  Line %d%s" % (f.lineno, "" if f.name == "<module>" else ", in %s()" % f.name))
            if f.line:
                lines.append("    " + f.line.strip())
    for part in te.format_exception_only():
        lines.extend(part.rstrip("\n").replace('File "<cell>", line', "Line").split("\n"))
    where = frames[-1].lineno if frames else getattr(e, "lineno", None)
    return "\n".join(lines) + "\n", ("line %d: " % where if where else "") + lines[-1].strip()

def _run(src, inputs):
    queue = json.loads(inputs)
    chunks = []
    count = [0]

    def push(t, s):
        if chunks and chunks[-1]["t"] == t and t != "val":
            chunks[-1]["s"] += s
        else:
            chunks.append({"t": t, "s": s})

    class Out:
        def __init__(self, t):
            self.t = t
        def write(self, s):
            s = str(s)
            push(self.t, s)
            count[0] += s.count("\n")
            if count[0] > MAX_LINES:
                raise _TooMuchOutput()
            return len(s)
        def flush(self):
            pass

    def ask(prompt=""):
        prompt = str(prompt)
        if prompt:
            push("prompt", prompt)
        if not queue:
            raise EOFError("input() ran out of values. Add one value per input() call in the Input box.")
        v = str(queue.pop(0))
        push("in", v + "\n")
        return v

    linecache.cache["<cell>"] = (len(src), None, src.splitlines(True), "<cell>")
    saved = sys.stdout, sys.stderr, builtins.input
    sys.stdout, sys.stderr, builtins.input = Out("out"), Out("err"), ask
    try:
        v = eval_code(src, {"__name__": "__main__"}, filename="<cell>")
        if v is not None:
            push("val", repr(v))
    except _TooMuchOutput:
        push("note", "\nOutput stopped after %s lines. Is this an infinite loop?" % format(MAX_LINES, ","))
    except SystemExit:
        pass
    except BaseException as e:
        text, short = _explain(e)
        if chunks and not chunks[-1]["s"].endswith("\n"):
            chunks[-1]["s"] += "\n"
        push("err", text)
        chunks[-1]["short"] = short
    finally:
        sys.stdout, sys.stderr, builtins.input = saved
    return json.dumps(chunks)
`;

var pyodide = loadPyodide({ indexURL: PYODIDE }).then(function (py) {
  py.runPython(RUNNER);
  postMessage({ type: "ready", version: py.runPython("import sys; sys.version.split()[0]") });
  return py;
}, function (e) {
  postMessage({ type: "failed", error: String(e && e.message || e) });
  throw e;
});

onmessage = function (e) {
  var m = e.data;
  pyodide.then(function (py) {
    if (/^\s*(import|from)\s+numpy\b/m.test(m.code) && !py.loadedPackages.numpy) postMessage({ type: "loading", id: m.id, what: "NumPy" });
    return py.loadPackagesFromImports(m.code, { messageCallback: function () {} }).catch(function () {}).then(function () {
      postMessage({ type: "started", id: m.id });
      try {
        postMessage({ type: "result", id: m.id, chunks: JSON.parse(py.globals.get("_run")(m.code, JSON.stringify(m.inputs))) });
      } catch (err) {
        // A JS-level crash (e.g. the WebAssembly stack overflowing) leaves Pyodide unusable, so ask for a restart.
        var msg = "Python crashed while running this code (" + String(err && err.message || err).split("\n")[0] + ").";
        postMessage({ type: "result", id: m.id, fatal: true, chunks: [{ t: "err", s: msg + "\n", short: msg }] });
      }
    });
  });
};
