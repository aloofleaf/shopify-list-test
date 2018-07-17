const dotenv = require('dotenv').config();
const express = require('express');
const app = express();
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');
const methodOverride = require('method-override');

const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const scope = 'write_products';
const forwardingAddress = 'http://shopify-list-test.herokuapp.com';

app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(methodOverride('_method'));

app.get('/', (req, res) => {
	res.send("got to the home page");

});

app.get('/shopify', (req, res) => {
	const shop = req.query.shop;
	if(shop){
		const state = nonce();
		const redirectUri = forwardingAddress + "/shopify/callback";
		const installUrl = 'https://' + shop + '/admin/oauth/authorize?client_id=' + apiKey + 
		'&scope=' + scope + 
		'&state=' + state +
		'&redirect_uri=' + redirectUri;

		res.cookie('state', state);
		res.redirect(installUrl);
	} else {
		return res.status(400).send('missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request');
	}
});

app.get('/shopify/callback', (req, res) => {
	const {shop, hmac, code, state } = req.query;
	const stateCookie = cookie.parse(req.headers.cookie).state;

	if(state !== stateCookie) {
		return res.status(403).send('Request Origin cannot be verified');
	}

	if(shop && hmac && code) {
		const map = Object.assign({}, req.query);
		delete map['hmac'];
		const message = querystring.stringify(map);
		const generatedHash = crypto
			.createHmac('sha256', apiSecret)
			.update(message)
			.digest('hex');
 
		if(generatedHash !== hmac){
			return res.status(400).send('HMAC validation failed');
		}

		const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
		const accessTokenPayload = {
			client_id: apiKey,
			client_secret: apiSecret,
			code
		};

		request.post(accessTokenRequestUrl, { json: accessTokenPayload })
		.then((accessTokenResponse) => {
			const accessToken = accessTokenResponse.access_token;
			const apiRequestUrl = 'https://' + shop + '/admin/products.json';
			const apiRequestHeader = {
				'X-Shopify-Access-Token': accessToken
			};

			request.get(apiRequestUrl, {headers: apiRequestHeader})
			.then((apiResponse) => {

				res.render('home', 
					{
						apiResponse: JSON.parse(apiResponse),
						token: accessToken,
						shop: shop
						// api_key: apiKey,
						// shop: shop
					});

				// res.end(apiResponse);
			})
			.catch((error) => {
				res.status(400).send(error.toString());
			});
		})
		.catch((error) => {
			res.status(400).send(error.toString());
		});

	} else {
		res.status(400).send('Requied parameters missing');
	}
});

app.put('/products/:id', function(req, res) {
	if(!req.query.token) {
		return res.status(400).send("error, no token in query");
	}
	const apiRequestHeader = {
		'X-Shopify-Access-Token': req.query.token
	};
	const product = {
	  "product": {
	   "id" : req.params.id,
			"body_html": "new body"
	  }
	};
	const apiRequestUrl = 'https://' + req.query.shop + '/admin/products/' + req.params.id + '.json';

	request.put(apiRequestUrl, {headers: apiRequestHeader})
	.then((apiResponse) => {

		res.render('home', 
			{
				apiResponse: JSON.parse(apiResponse),
				token: accessToken,
				shop: shop
				// api_key: apiKey,
				// shop: shop
			});

		// res.end(apiResponse);
	})
	.catch((error) => {
		res.status(400).send(error.toString());
	});
});



app.listen(process.env.PORT, ()=> {
	console.log('listening on port ' + process.env.PORT);
});