import {mkdirSync} from 'node:fs';
mkdirSync('output',{recursive:true});
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.PDF_SHARE_DIR ||= mkdtempSync(join(tmpdir(),'pdf-share-tests-'));
import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.js',use:{baseURL:process.env.TEST_URL || 'http://127.0.0.1:8080',headless:true},webServer:process.env.TEST_URL?undefined:{command:'node server.mjs',url:'http://127.0.0.1:8080',reuseExistingServer:true}});
