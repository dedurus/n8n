import {
	IExecuteFunctions,
} from 'n8n-core';

import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	IAlias,
	IEvent,
	IIdentity,
	ITrack,
	posthogApiRequest,
} from './GenericFunctions';

import {
	aliasFields,
	aliasOperations,
} from './AliasDescription';

import {
	eventFields,
	eventOperations,
} from './EventDescription';

import {
	trackFields,
	trackOperations,
} from './TrackDescription';

import {
	identityFields,
	identityOperations,
} from './IdentityDescription';

import * as moment from 'moment-timezone';

export class PostHog implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PostHog',
		name: 'postHog',
		icon: 'file:postHog.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume PostHog API.',
		defaults: {
			name: 'PostHog',
			color: '#000000',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'postHogApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Alias',
						value: 'alias',
					},
					{
						name: 'Event',
						value: 'event',
					},
					{
						name: 'Identity',
						value: 'identity',
					},
					{
						name: 'Track',
						value: 'track',
					},
				],
				default: 'event',
				description: 'The resource to operate on.',
			},
			...aliasOperations,
			...aliasFields,
			...eventOperations,
			...eventFields,
			...identityOperations,
			...identityFields,
			...trackOperations,
			...trackFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: IDataObject[] = [];
		const length = (items.length as unknown) as number;
		const qs: IDataObject = {};
		let responseData;
		const resource = this.getNodeParameter('resource');
		const operation = this.getNodeParameter('operation');

		if (resource === 'alias') {
			if (operation === 'create') {
				for (let i = 0; i < length; i++) {
					const distinctId = this.getNodeParameter('distinctId', i) as string;

					const alias = this.getNodeParameter('alias', i) as string;

					const additionalFields = this.getNodeParameter('additionalFields', i);

					const context = (additionalFields.contextUi as IDataObject || {}).contextValues as IDataObject[] || [];

					const event: IAlias = {
						type: 'alias',
						event: '$create_alias',
						context: context.reduce((obj, value) => Object.assign(obj, { [`${value.key}`]: value.value }), {}),
						properties: {
							distinct_id: distinctId,
							alias,
						},
					};

					Object.assign(event, additionalFields);

					if (additionalFields.timestamp) {
						additionalFields.timestamp = moment(additionalFields.timestamp as string).toISOString();
					}

					responseData = await posthogApiRequest.call(this, 'POST', '/batch', event);

					returnData.push(responseData);
				}
			}
		}

		if (resource === 'event') {
			if (operation === 'create') {
				const events: IEvent[] = [];
				for (let i = 0; i < length; i++) {
					const eventName = this.getNodeParameter('eventName', i) as string;

					const distinctId = this.getNodeParameter('distinctId', i) as string;

					const additionalFields = this.getNodeParameter('additionalFields', i);

					const properties = (additionalFields.propertiesUi as IDataObject || {}).propertyValues as IDataObject[] || [];

					const event: IEvent = {
						event: eventName,
						properties: properties.reduce((obj, value) => Object.assign(obj, { [`${value.key}`]: value.value }), {}),
					};

					event.properties['distinct_id'] = distinctId;

					Object.assign(event, additionalFields);

					if (additionalFields.timestamp) {
						additionalFields.timestamp = moment(additionalFields.timestamp as string).toISOString();
					}
					//@ts-ignore
					delete event.propertiesUi;

					events.push(event);
				}

				responseData = await posthogApiRequest.call(this, 'POST', '/capture', { batch: events });

				returnData.push(responseData);
			}
		}

		if (resource === 'identity') {
			if (operation === 'create') {
				for (let i = 0; i < length; i++) {
					const distinctId = this.getNodeParameter('distinctId', i) as string;

					const additionalFields = this.getNodeParameter('additionalFields', i);

					const properties = (additionalFields.propertiesUi as IDataObject || {}).propertyValues as IDataObject[] || [];

					const event: IIdentity = {
						event: '$identify',
						properties: properties.reduce((obj, value) => Object.assign(obj, { [`${value.key}`]: value.value }), {}),
						distinct_id: distinctId,
					};

					Object.assign(event, additionalFields);

					if (additionalFields.timestamp) {
						additionalFields.timestamp = moment(additionalFields.timestamp as string).toISOString();
					}
					//@ts-ignore
					delete event.propertiesUi;

					responseData = await posthogApiRequest.call(this, 'POST', '/batch', event);

					returnData.push(responseData);
				}
			}
		}

		if (resource === 'track') {
			if (operation === 'page' || operation === 'screen') {
				for (let i = 0; i < length; i++) {
					const distinctId = this.getNodeParameter('distinctId', i) as string;

					const name = this.getNodeParameter('name', i);

					const additionalFields = this.getNodeParameter('additionalFields', i);

					const context = (additionalFields.contextUi as IDataObject || {}).contextValues as IDataObject[] || [];

					const properties = (additionalFields.propertiesUi as IDataObject || {}).propertyValues as IDataObject[] || [];

					const event: ITrack = {
						name,
						type: operation,
						event: `$${operation}`,
						context: context.reduce((obj, value) => Object.assign(obj, { [`${value.key}`]: value.value }), {}),
						distinct_id: distinctId,
						properties: properties.reduce((obj, value) => Object.assign(obj, { [`${value.key}`]: value.value }), {}),
					};

					Object.assign(event, additionalFields);

					if (additionalFields.timestamp) {
						additionalFields.timestamp = moment(additionalFields.timestamp as string).toISOString();
					}
					//@ts-ignore
					delete event.propertiesUi;

					responseData = await posthogApiRequest.call(this, 'POST', '/batch', event);

					returnData.push(responseData);
				}
			}
		}

		return [this.helpers.returnJsonArray(returnData)];
	}
}
