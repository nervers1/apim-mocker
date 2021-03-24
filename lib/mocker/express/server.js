'use strict';

require('dotenv')
	.config({path:'conf/.env'});
const bodyParser = require('body-parser');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const logger = require('lllog')();
const colors = require('colors');
const parsePreferHeader = require('parse-prefer-header');
const db = require('./postgre-database.js');

const openApiMockSymbol = Symbol('openApiMock');

class Server {

	constructor() {
		this.servers = [];
		this.paths = [];
	}

	setServers(servers) {
		this.servers = servers;
		return this;
	}

	setPort(port) {
		this.port = port;
		return this;
	}

	setPaths(paths) {
		this.paths = paths;
		return this;
	}

	async init() {

		if(this.server)
			await this.shutdown();


		const app = express();
		app.use('*', (req, res, next) => {

			res[openApiMockSymbol] = {
				initTime: Date.now()
			};

			logger.info(`${colors.yellow('>')} [${req.method}] ${req.originalUrl}`);

			next();
		});

		app.use(
			cookieParser(),
			cors({
				origin: true,
				credentials: true
			}),
			bodyParser.json(),
			bodyParser.urlencoded({
				limit: '50mb',
				extended: false,
				parameterLimit: 50000
			}),
			bodyParser.text(),
			bodyParser.raw()
		);

		this._loadBasePaths();

		this.paths.map(path => {

			logger.debug(`Processing schema path ${path.httpMethod.toUpperCase()} ${path.uri}`);

			const expressHttpMethod = path.httpMethod.toLowerCase();

			const uris = this._normalizeExpressPath(path.uri);

			app[expressHttpMethod](uris, (req, res) => {
				this._checkContentType(req);

				const {
					query,
					params,
					headers,
					cookies,
					body: requestBody
				} = req;

				//{path}와 같은 get방식 method에 대해 다시 정상적인지 체크
				if(/\/{[A-z0-9_-]+}/.exec(path.uri)){
					var newpath = this.paths.find(newpath => {
						const uris = this._normalizeExpressPath(newpath.uri);
						var currentUrl = req.url.split('?')[0];
						if(uris[0] === currentUrl){
							return newpath;
						}
					});
					if(newpath)
						path = newpath;
				}

				const failedValidations = path.validateRequestParameters({
					query,
					path: params,
					headers,
					cookies,
					requestBody
				});

				if(failedValidations.length)
					return this.sendResponse(res, { rsp_code : '40001', rsp_msg: failedValidations.join(", ") }, 400);


				const preferHeader = req.header('prefer') || '';
				const {
					example: preferredExampleName,
					statusCode: preferredStatusCode
				} = parsePreferHeader(preferHeader) || {};

				if(preferredStatusCode)
					logger.debug(`Searching requested response with status code ${preferredStatusCode}`);
																 else
					logger.debug('Searching first response');


				const { statusCode, headers: responseHeaders, body } = path.getResponse(preferredStatusCode, preferredExampleName);
				logger.info('statusCode : ' + JSON.stringify(statusCode));
				logger.info('headers : ' + JSON.stringify(responseHeaders));
				logger.info('body : ' + JSON.stringify(body));

				(async () => {
					let client;
					try {
						client = await db.pool.connect();
						const q = db.getQuery(req, path);
						const result = await client.query(q);

						// 테스트가 존재하지 않을 때
						if(result.rowCount === 0){
							let data = { rsp_code : '40402', rsp_msg: '요청한 자산에 대한 정보는 존재하지 않음.' };
							return this.sendResponse(res, data, 404, responseHeaders);
						}
							
						const data = result.rows[0].res_data;
						logger.info(data);
						let limit = (req.method === 'GET') ? req.query.limit : req.body.limit;
						if(limit){							
							let page = (req.method === 'GET') ? req.query.next_page : req.body.next_page;
							page = page ? page * 1 : 0;
							let next_page = (limit * 1 ) + (page * 1);

							let from_date = (req.method === 'GET') ? req.query.from_date : req.body.from_date;
							let to_date = (req.method === 'GET') ? req.query.to_date : req.body.to_date;

							if(data.trans_cnt){
								var startDate = this.parseStringYYYYMMDD(from_date);
								var endDate = this.parseStringYYYYMMDD(to_date);
								//1. 정렬
								data.trans_list.sort(function(a,b) {
									return parseFloat(b.trans_dtime) - parseFloat(a.trans_dtime);
								});
								//2. date 검색
								var parent = this;
								data.trans_list = data.trans_list.filter(function (a) {
									var hitDates;
									if(a.trans_dtime)
										hitDates = parent.parseStringYYYYMMDD(a.trans_dtime);
									else if(a.trans_date)
										hitDates = parent.parseStringYYYYMMDD(a.trans_date);
									return hitDates >= startDate && hitDates <= endDate
								});
								var values = this.paginate(data.trans_list, page, next_page);
								var list = values[0];
								var count = values[1];
								var totalCount = values[2];

								if(totalCount > count + page) 
									data.next_page = next_page + "";
								else if(data.next_page) 
									delete data.next_page;

								data.trans_list = list;
								data.trans_cnt = count + "";
							}
							else if(data.bill_cnt){
								var startDate = this.parseStringYYYYMM(req.query.from_month);
								var date = this.parseStringYYYYMM(req.query.to_month);
								var endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

								//1. 정렬
								data.bill_list.sort(function(a,b) {
									return parseFloat(b.paid_out_date) - parseFloat(a.paid_out_date);
								});
								//2. date 검색
								var parent = this;
								data.bill_list = data.bill_list.filter(function (a) {
									var hitDates = parent.parseStringYYYYMMDD(a.paid_out_date);
									return hitDates >= startDate && hitDates <= endDate
								});
								var values = this.paginate(data.bill_list, page, next_page);
								var list = values[0];
								var count = values[1];
								var totalCount = values[2];

								if(totalCount > count + page) 
									data.next_page = next_page + "";
								else if(data.next_page) 
									delete data.next_page;

								data.bill_list = list;
								data.bill_cnt = count + "";
							}
							else if(data.bill_detail_cnt){
								var date = this.parseStringYYYYMM(req.query.charge_month);
								var startDate = new Date(date.getFullYear(), date.getMonth(), 1);
								var endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

								//1. 정렬
								data.bill_detail_list.sort(function(a,b) {
									return parseFloat(b.paid_dtime) - parseFloat(a.paid_dtime);
								});
								//2. date 검색
								data.bill_detail_list = data.bill_detail_list.filter(function (a) {
									hitDates = parent.parseStringYYYYMMDD(a.paid_dtime);
									return hitDates >= startDate && hitDates <= endDate
								});
								var values = this.paginate(data.bill_detail_list, page, next_page);
								var list = values[0];
								var count = values[1];
								var totalCount = values[2];

								if(totalCount > count + page) 
									data.next_page = next_page + "";
								else if(data.next_page) 
									delete data.next_page;

								data.bill_detail_list = list;
								data.bill_detail_cnt = count + "";
							}
							else if(data.account_cnt){
								//1. 정렬
								data.account_list.sort(function(a,b) {
									if(a.account_type != b.account_type)
										return parseFloat(a.account_type) - parseFloat(b.account_type);
									return parseFloat(a.account_num) - parseFloat(b.account_num);
								});
								var values = this.paginate(data.account_list, page, next_page);
								var list = values[0];
								var count = values[1];
								var totalCount = values[2];

								if(totalCount > count + page) 
									data.next_page = next_page + "";
								else if(data.next_page) 
									delete data.next_page;

								data.account_list = list;
								data.account_cnt = count + "";
							}
							else if(data.approved_cnt){
								//1. 정렬
								data.approved_list.sort(function(a,b) {
									return parseFloat(b.approved_dtime) - parseFloat(a.approved_dtime);
								});
								var values = this.paginate(data.approved_list, page, next_page);
								var list = values[0];
								var count = values[1];
								var totalCount = values[2];

								if(totalCount > count + page) 
									data.next_page = next_page + "";
								else if(data.next_page) 
									delete data.next_page;

								data.approved_list = list;
								data.approved_cnt = count + "";
							}
						}
						
						return this.sendResponse(res, data, statusCode, responseHeaders);

						// client.release();
					} finally {
						// Make sure to release the client before any error handling,
						// just in case the error handling itself throws an error.
						client.release();
					}
				})().catch(err => {
					let data = { rsp_code : '50001', rsp_msg: '시스템 장애가 발생했습니다. 담당자에게 연락 부탁드립니다.'};
					logger.info(err.stack);
					return this.sendResponse(res, data, 500, responseHeaders);
					//logger.info(err.stack);
					//return this.sendResponse(res, err, statusCode, responseHeaders);
				});

				/* const pool = db.getPool();
																const q = db.getQuery(req);
																pool
																				.query(q)
																				.then(result => {
																								logger.info(result.rows[0].res_data);
																								return this.sendResponse(res, result.rows[0].res_data, statusCode, responseHeaders);
																				})
																				.catch(err => {
																								logger.error('Error executing query', err.stack);
																								return this.sendResponse(res, err, statusCode, responseHeaders);
																				});*/

			});

			return uris.map(uri => {
				return logger.info(`Handling route ${path.httpMethod.toUpperCase()} ${uri}`);
			});
		});

		app.all('*', this._notFoundHandler.bind(this));

		this.server = app.listen(this.port);

		this.server.on('listening', err => {

			if(err)
				throw err;


			const realPort = this.server.address().port;

			logger.info(`Mocking API at ${realPort}`);
		});
	}

	shutdown() {
		logger.debug('Closing express server...');
		this.server.close();
	}

	_loadBasePaths() {
		const basePaths = [...new Set(this.servers.map(({ url }) => url.pathname.replace(/\/+$/, '')))];

		if(basePaths.length)
			logger.debug(`Found the following base paths: ${basePaths.join(', ')}`);


		this.basePaths = basePaths.length ? basePaths : [''];
	}

	_checkContentType(req) {
		const contentType = req.header('content-type');
		if(!contentType)
			logger.warn(`${colors.yellow('*')} Missing content-type header`);

	}

	_notFoundHandler(req, res) {
		return this.sendResponse(res, {
			rsp_msg: `Path not found: ${req.originalUrl}`,
			rsp_code: '40401'
		}, 404);
	}

	_normalizeExpressPath(schemaUri) {
		const normalizedPath = schemaUri.replace(/\{([a-z0-9_]+)\}/gi, ':$1')
			.replace(/^\/*/, '/');

		return this.basePaths.map(basePath => `${basePath}${normalizedPath}`);
	}

	sendResponse(res, body, statusCode, headers) {

		statusCode = statusCode || 200;
		headers = headers || {};

		const responseTime = Date.now() - res[openApiMockSymbol].initTime;

		const color = statusCode < 400 ? colors.green : colors.red;

		logger.info(`${color('<')} [${statusCode}] ${JSON.stringify(body)} (${responseTime} ms)`);

		res
			.status(statusCode)
			.set(headers)
			.set('x-powered-by', 'apim-mock')
			.json(body);
	}

	getNextPage(trans_cnt, page, limit) {
		let lastPage = (trans_cnt / limit) + 1;
		lastPage = Math.ceil(lastPage);

		page *= 1;
		trans_cnt *= 1

		if(lastPage <= page + 1)
			return undefined;
		if(trans_cnt < limit * (page - 1))
			return lastPage + "";
		return ++page + "";
	}

	parseStringYYYYMMDD(str) {
		var y = str.substr(0, 4);
		var m = str.substr(4, 2);
		var d = str.substr(6, 2);
		return new Date(y,m-1,d);
	}

	parseStringYYYYMM(str) {
		var y = str.substr(0, 4);
		var m = str.substr(4, 2);
		return new Date(y,m-1);
	}

	paginate(list, page, next_page) {
		//3. 페이징
		var totalCount = list.length;
		list = list.slice(page, next_page);

		var count = list.length;
		return [list, count, totalCount];
	}

	//paginate(array, page_size, page_number) {
	//	// human-readable page numbers usually start with 1, so we reduce 1 in the first argument
	//	return array.slice((page_number - 1) * page_size, page_number * page_size);
	//}
}

module.exports = Server;
