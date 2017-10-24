/**
 * Vanilla JS cookie module
 * @module express/front/cookie
 */

/**
 * Cookie helper
 */
export class Cookie {
    /**
     * Set a cookie
     * @param {string} name                 Cookie name
     * @param {string} value                Cookie value
     * @param {number} [lifetime]           Milliseconds until expiration
     */
    static set(name, value, lifetime) {
        let expires = '';
        if (lifetime) {
            let date = new Date();
            date.setTime(date.getTime() + lifetime);
            expires = '; expires=' + date.toGMTString();
        }

        document.cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value) + expires + '; path=/';
    }

    /**
     * Get a cookie
     * @param {string} name                 Cookie name
     * @return {string|null}
     */
    static get(name) {
        for (let cookie of document.cookie.split(';')) {
            let [ thisName, thisValue ] = cookie.trim().split('=');
            if (decodeURIComponent(thisName) === name)
                return decodeURIComponent(thisValue);
        }

        return null;
    }

    /**
     * Delete a cookie
     * @param {string} name                 Cookie name
     */
    static del(name) {
        return this.set(name, '', -1 * 24 * 60 * 60 * 1000);
    }
}
