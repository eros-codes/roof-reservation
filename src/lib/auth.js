import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signUserToken(user) {
	return jwt.sign({ sub: user.id, phone: user.phone, ver: user.tokenVersion ?? 0, type: 'user' }, config.jwtSecret, { expiresIn: '30d' });
}

export function signGuestToken(payload) {
	return jwt.sign({ ...payload, type: 'guest' }, config.jwtSecret, { expiresIn: '2h' });
}

export function signAdminToken(admin) {
	return jwt.sign(
		{ sub: admin.id, email: admin.email, role: admin.role, ver: admin.tokenVersion ?? 0, type: 'admin' },
		config.adminJwtSecret,
		{ expiresIn: '12h' },
	);
}

function verifyTyped(token, secret, expectedType) {
	const payload = jwt.verify(token, secret);
	if (payload.type !== expectedType) throw new Error('نوع توکن نامعتبر است.');
	return payload;
}

export function verifyUserToken(token) {
	return verifyTyped(token, config.jwtSecret, 'user');
}

export function verifyAdminToken(token) {
	return verifyTyped(token, config.adminJwtSecret, 'admin');
}

export function verifyGuestToken(token) {
	return verifyTyped(token, config.jwtSecret, 'guest');
}

const COOKIE_MAX_AGE = {
	adminToken: 12 * 60 * 60 * 1000,
	guestToken: 2 * 60 * 60 * 1000,
	userToken: 30 * 24 * 60 * 60 * 1000,
};

function cookieOptions(name) {
	return {
		httpOnly: true,
		sameSite: name === 'adminToken' ? 'strict' : 'lax',
		secure: config.isProd,
		path: '/',
	};
}

export function setCookie(res, name, token) {
	res.cookie(name, token, {
		...cookieOptions(name),
		maxAge: COOKIE_MAX_AGE[name] || COOKIE_MAX_AGE.userToken,
	});
}

export function clearCookie(res, name) {
	res.clearCookie(name, cookieOptions(name));
}
