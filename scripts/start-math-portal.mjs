import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {cpus} from 'node:os';
const python=process.env.PDF_PARSER_PYTHON||resolve('.pdf-runtime/venv/bin/python');
const formulaPython=process.env.PDF_FORMULA_PYTHON||resolve('.pdf-runtime/formula-venv/bin/python');
await access(python).catch(()=>{throw Error('Install the PDF parser first. See README.md: Automatic PDF parser.');});
await access(formulaPython).catch(()=>{throw Error('Install the equation recognizer first. See README.md: Automatic PDF parser.');});
// Local dev only: use more of a multi-core machine. Thread counts affect speed,
// not conversion output; capped near physical cores to avoid hyperthread thrash.
const threads=process.env.PDF_LOCAL_THREADS||String(Math.max(1,Math.min(cpus().length,8)));
const child=spawn(process.execPath,['server.mjs'],{stdio:'inherit',env:{...process.env,PDF_PARSER_PYTHON:python,PDF_FORMULA_PYTHON:formulaPython,MINERU_MODEL_SOURCE:'local',MINERU_MODEL_BASE_DIR:process.env.MINERU_MODEL_BASE_DIR||resolve('.pdf-runtime/models'),MINERU_HOME:resolve('.pdf-runtime/mineru'),HF_HUB_OFFLINE:'1',MINERU_MODEL_SMALL_BACKEND:'onnx',MINERU_INTRA_OP_NUM_THREADS:process.env.MINERU_INTRA_OP_NUM_THREADS||threads,PDF_FORMULA_THREADS:process.env.PDF_FORMULA_THREADS||threads,OMP_NUM_THREADS:process.env.OMP_NUM_THREADS||threads,MKL_NUM_THREADS:process.env.MKL_NUM_THREADS||threads}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exitCode=code||0);
