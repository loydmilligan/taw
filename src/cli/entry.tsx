#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from '../app/App.js';
import { bootstrapApp } from './bootstrap.js';

const state = await bootstrapApp(process.cwd());

render(<App state={state} />);
