'use strict';
let postgre = {};
const logger = require('lllog')();
const parseUrl = require('parseurl');
const colors = require('sinon');
// Postgres Configuration
const { Pool } = require('pg');
const config = {
				user: process.env.DB_USER,
				host: process.env.DB_HOST,
				database: process.env.DB_DATABASE,
				password: process.env.DB_PASSWORD,
				port: process.env.DB_PORT,
				max: 20,
				idleTimeoutMillis: 30000,
				connectionTimeoutMillis: 2000,
};
postgre.pool = new Pool(config);

postgre.getPool = async function () {
				return new Pool(config);
};

postgre.pool.on('error', async (err, client) => {
				logger.info(`${colors.red('>')} [Error] ${err}`);
				await client.release();
				process.exit(-1)
});

postgre.getQuery = function(req) {
				const sql1 = 'SELECT res_data FROM tb_test_data WHERE api_id = $1 and own_org_cd = $2 and org_cd = $3';
				const sql2 = 'SELECT res_data FROM tb_test_data WHERE api_id = $1 and own_org_cd = $2 and org_cd = $3 and ast_id = $4';

				let pathname = parseUrl(req).pathname;
				logger.info('----------');
				logger.info(req.method);
				logger.info(req.query);
				logger.info(req.body);
				logger.info(req.headers);
				logger.info(req.originalUrl);
				logger.info(pathname);
				logger.info('----------');

				let query = {};
				let r = {};
				let ast_id;
				let own_org_cd = req.header('x-own-org-cd');
				let api_id = req.header('x-api-id');
				let org_cd = (req.method === 'GET') ? req.query.org_code : req.body.org_code;
				logger.info(req.body);
				switch (api_id) {
								case '101': // org_code를 base로 기본 조회하는 거래들
								case '201':
								case '301':
								case '401':
								case '501':
								case '601':
								case '102':
								case '202':
								case '302':
								case '402':
								case '502':
								case '602':
								case '103':
								case '203':
								case '303':
								case '107':
								case '207':
								case '307':
								case '214':
												r = postgre.setParam(query, sql1, api_id, own_org_cd, org_cd);
												break;
								case '104': // 은행업권, 금투업권 등은 account_num 기준으로 조회
								case '204':
								case '304':
								case '105':
								case '205':
								case '305':
								case '108':
								case '308':
								case '109':
								case '309':
								case '110':
												ast_id = (req.method === 'GET') ? req.query.account_num : req.body.account_num;
												r = postgre.setParam(query, sql2, api_id, own_org_cd, org_cd, ast_id);
												break;
								case '208': // 보험 업권은 insu_num 기준으로 조회
								case '209':
								case '210':
								case '211':
												ast_id = (req.method === 'GET') ? req.query.insu_num : req.body.insu_num;
												r = postgre.setParam(query, sql2, api_id, own_org_cd, org_cd, ast_id);
												break;
								case '215': // 페이징 관련 추가작업 해야 할 것들 ...
								case '106':
								case '206':
								case '306':
								case '216':
								case '217':
								case '310':
												ast_id = (req.method === 'GET') ? req.query.account_num : req.body.account_num;
												r = postgre.setParam(query, sql2, api_id, own_org_cd, org_cd, ast_id);
												break;
								default:
												logger.info('Error : No such a api_id value.....');
				}

				logger.info(r);
				return r;
}
postgre.setParam = function(query, sql, api_id, own_org_cd, org_cd, ast_id) {
				query.text = sql;
				query.values = [];
				query.values.push(api_id);
				query.values.push(own_org_cd);
				query.values.push(org_cd);
				if (ast_id) {
								query.values.push(ast_id);
				}
				return query;
};
postgre.query = async function (q) {
				const client = postgre.pool.connect();
				return await client.query(q);
}
module.exports = postgre;
