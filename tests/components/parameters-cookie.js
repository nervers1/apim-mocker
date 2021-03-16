'use strict';

const assert = require('assert');

const ParameterStruct = require('../../lib/components/parameters/structs');

describe('Components', () => {

	describe('Parameters', () => {

		describe('Cookie parameters', () => {

			it('Should pass if the parameter has the required properties', () => {

				const parameter = {
					name: 'someName',
					in: 'cookie'
				};

				ParameterStruct(parameter);
			});

			it('Should throw if any optional property is invalid', () => {

				const parameter = {
					name: 'someName',
					in: 'cookie'
				};

				assert.throws(() => ParameterStruct({
					...parameter,
					allowEmptyValue: true
				}), {
					path: ['allowEmptyValue']
				});

				assert.throws(() => ParameterStruct({
					...parameter,
					allowReserved: true
				}), {
					path: ['allowReserved']
				});
			});

			it('Should pass if the parameter has the required properties and valid optional properties', () => {

				const parameter = {
					name: 'someName',
					in: 'cookie',
					required: false
				};

				ParameterStruct(parameter);
			});
		});
	});
});
