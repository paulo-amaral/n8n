import {
	BINARY_ENCODING,
	IExecuteFunctions,
} from 'n8n-core';

import {
	IBinaryData,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	readFile,
	rm,
	writeFile,
} from 'fs/promises'

import { file } from 'tmp-promise';

const nodeSSH = require('node-ssh');

export class Ssh implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SSH',
		name: 'Ssh',
		icon: 'fa:terminal',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Execute commands via SSH',
		defaults: {
			name: 'SSH',
			color: '#000000',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'sshPassword',
				required: true,
				displayOptions: {
					show: {
						authentication: [
							'password',
						],
					},
				},
			},
			{
				name: 'sshPrivateKey',
				required: true,
				displayOptions: {
					show: {
						authentication: [
							'privateKey',
						],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'Password',
						value: 'password',
					},
					{
						name: 'Private Key',
						value: 'privateKey',
					},
				],
				default: 'password',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Command',
						value: 'command',
					},
					{
						name: 'File',
						value: 'file',
					},
				],
				default: 'command',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: [
							'command',
						],
					},
				},
				options: [
					{
						name: 'Execute',
						value: 'execute',
						description: 'Execute a command',
					},
				],
				default: 'execute',
				description: 'Operation to perform.',
			},
			{
				displayName: 'Command',
				name: 'command',
				type: 'string',
				displayOptions: {
					show: {
						resource: [
							'command',
						],
						operation: [
							'execute',
						],
					},
				},
				default: '',
				description: 'The command to be executed on a remote device.',
			},
			{
				displayName: 'Working Directory',
				name: 'cwd',
				type: 'string',
				displayOptions: {
					show: {
						resource: [
							'command',
						],
						operation: [
							'execute',
						],
					},
				},
				default: '/',
				required: true,
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: [
							'file',
						],
					},
				},
				options: [
					{
						name: 'Download',
						value: 'download',
						description: 'Download a file',
					},
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a file',
					},
				],
				default: 'upload',
				description: 'Operation to perform.',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						operation: [
							'upload',
						],
						resource: [
							'file',
						],
					},
				},
				placeholder: '',
				description: 'Name of the binary property which contains<br />the data for the file to be uploaded.',
			},
			{
				displayName: 'Target Directory',
				name: 'path',
				type: 'string',
				displayOptions: {
					show: {
						resource: [
							'file',
						],
						operation: [
							'upload',
						],
					},
				},
				default: '',
				required: true,
				placeholder: '/home/user',
				description: `The directory to upload the file to. The name of the file does not need to be specified,</br>
				it's taken from the binary data file name. To override this behavior, set the parameter</br>
				"File Name" under options.`,
			},
			{
				displayName: 'Path',
				displayOptions: {
					show: {
						resource: [
							'file',
						],
						operation: [
							'download',
						],
					},
				},
				name: 'path',
				type: 'string',
				default: '',
				placeholder: '/home/user/invoice.txt',
				description: 'The file path of the file to download. Has to contain the full path including file name.',
				required: true,
			},
			{
				displayName: 'Binary Property',
				displayOptions: {
					show: {
						resource: [
							'file',
						],
						operation: [
							'download',
						],
					},
				},
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Object property name which holds binary data.',
				required: true,
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				displayOptions: {
					show: {
						resource: [
							'file',
						],
						operation: [
							'upload',
						],
					},
				},
				default: {},
				options: [
					{
						displayName: 'File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						description: `Overrides the binary data file name.`,
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		const returnData: IDataObject[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const authentication = this.getNodeParameter('authentication', 0) as string;

		const temporaryFiles: string[] = [];

		const ssh = new nodeSSH.NodeSSH();

		try {
			if (authentication === 'password') {

				const credentials = this.getCredentials('sshPassword') as IDataObject;

				await ssh.connect({
					host: credentials.host as string,
					username: credentials.username as string,
					port: credentials.port as number,
					password: credentials.password as string,
				});

			} else if (authentication === 'privateKey') {

				const credentials = this.getCredentials('sshPrivateKey') as IDataObject;

				const { path, } = await file();
				temporaryFiles.push(path);
				await writeFile(path, credentials.privateKey as string);

				const options = {
					host: credentials.host as string,
					username: credentials.username as string,
					port: credentials.port as number,
					privateKey: path,
				} as any; // tslint:disable-line: no-any

				if (!credentials.passphrase) {
					options.passphrase = credentials.passphrase as string;
				}

				await ssh.connect(options);
			}

			for (let i = 0; i < items.length; i++) {

				if (resource === 'command') {

					if (operation === 'execute') {

						const command = this.getNodeParameter('command', i) as string;
						const cwd = this.getNodeParameter('cwd', i) as string;
						returnData.push(await ssh.execCommand(command, { cwd, }));
					}
				}

				if (resource === 'file') {

					if (operation === 'download') {

						const dataPropertyNameDownload = this.getNodeParameter('binaryPropertyName', i) as string;
						const parameterPath = this.getNodeParameter('path', i) as string;

						const { path } = await file({mode: 0x0777, prefix: 'prefix-'});
						temporaryFiles.push(path);

						await ssh.getFile(path, parameterPath);

						const newItem: INodeExecutionData = {
							json: items[i].json,
							binary: {},
						};

						if (items[i].binary !== undefined) {
							// Create a shallow copy of the binary data so that the old
							// data references which do not get changed still stay behind
							// but the incoming data does not get changed.
							Object.assign(newItem.binary, items[i].binary);
						}

						items[i] = newItem;

						const data = await readFile(path as string);

						items[i].binary![dataPropertyNameDownload] = await this.helpers.prepareBinaryData(data, parameterPath);
					}

					if (operation === 'upload') {

						const parameterPath = this.getNodeParameter('path', i) as string;
						const fileName = this.getNodeParameter('options.fileName', i, '') as string;

						const item = items[i];

						if (item.binary === undefined) {
							throw new Error('No binary data exists on item!');
						}

						const propertyNameUpload = this.getNodeParameter('binaryPropertyName', i) as string;

						const binaryData = item.binary[propertyNameUpload] as IBinaryData;

						if (item.binary[propertyNameUpload] === undefined) {
							throw new Error(`No binary data property "${propertyNameUpload}" does not exists on item!`);
						}

						const { path } = await file();
						temporaryFiles.push(path);
						await writeFile(path, Buffer.from(binaryData.data, BINARY_ENCODING));

						await ssh.putFile(path, `${parameterPath}${(parameterPath.charAt(parameterPath.length -1) === '/') ? '' : '/'}${fileName || binaryData.fileName}`);

						returnData.push({ success: true });
					}
				}
			}
		} catch (error) {
			ssh.dispose();
			for (const tempFile of temporaryFiles) await rm(tempFile);
			throw error;
		}

		for (const tempFile of temporaryFiles) await rm(tempFile);

		ssh.dispose();

		if (resource === 'file' && operation === 'download') {
			// For file downloads the files get attached to the existing items
			return this.prepareOutputData(items);
		} else {
			return [this.helpers.returnJsonArray(returnData)];
		}
	}
}