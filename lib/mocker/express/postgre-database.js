'use strict';

const postgre = {};
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
	connectionTimeoutMillis: 2000
};
postgre.pool = new Pool(config);

postgre.getPool = async function() {
	return new Pool(config);
};

postgre.pool.on('error', async (err, client) => {
	logger.info(`${colors.red('>')} [Error] ${err}`);
	await client.release();
	process.exit(-1);
});

postgre.getQuery = function(req, path) {
	let sql;
	const sql1 = 'SELECT res_data FROM tb_test_data WHERE api_id = $1 and own_org_cd = $2 and org_cd = $3';
	const sql2 = 'SELECT res_data FROM tb_test_data WHERE api_id = $1 and own_org_cd = $2 and org_cd = $3 and ast_id = $4';

	const { pathname } = parseUrl(req);
	logger.info('----------');
	logger.info(req.method);
	logger.info(req.query);
	logger.info(req.body);
	logger.info(req.headers);
	logger.info(req.originalUrl);
	logger.info(pathname);
	logger.info('----------');
	
	const query = {};
	let r = {};
	const own_org_cd = req.header('x-own-org-cd');
	const api_id = req.header('x-api-id');
	if(!api_id)
		logger.info('Error : No such a api_id value.....');
	
	let org_cd = (req.method === 'GET') ? req.query.org_code : req.body.org_code;
	org_cd = org_cd ? org_cd : '0000000000';
	let ast_id = postgre.getAstId(api_id, req.method, req.query, req.body, pathname, path);
	sql = ast_id ? sql2 : sql1;
	r = postgre.setParam(query, sql, api_id, own_org_cd, org_cd, ast_id);
	
	logger.info(r);
	return r;
};

postgre.getAstId = function(api_id, method, query, body, pathname, path){
	let ast_id;
	if(query.ast_id != "undefined")
		ast_id = (method === 'GET') ? query.insu_num : body.insu_num;
	if(!query.ast_id)
		ast_id = (method === 'GET') ? query.sub_key : body.sub_key;
	if(!query.ast_id)
		ast_id = (method === 'GET') ? query.account_num : body.account_num;
	if(!query.ast_id && method === 'GET' 
		&& /\/{[A-z0-9_-]+}/.exec(path.uri))
		ast_id = postgre.getPathVal(pathname, 3);
	return ast_id;
};

postgre.setParam = function(query, sql, api_id, own_org_cd, org_cd, ast_id) {
	query.text = sql;
	query.values = [];
	query.values.push(api_id);
	query.values.push(own_org_cd);
	query.values.push(org_cd);
	if(ast_id)
		query.values.push(ast_id);

	return query;
};
postgre.query = async function(q) {
	const client = postgre.pool.connect();
	return await client.query(q);
};
postgre.getPathVal = function(path, idx) {
	const arrPath = path.split('/');
	logger.info('>>>>>> ', arrPath[idx + 1]);
	return arrPath[idx + 1];
};
module.exports = postgre;
