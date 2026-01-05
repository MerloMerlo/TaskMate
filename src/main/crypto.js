const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For AES, this is always 16
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Derives a 32-byte key from a password using a salt.
 * @param {string} password 
 * @param {Buffer} salt 
 */
function getKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
}

/**
 * Encrypts text using AES-256-GCM
 * Format: salt + iv + tag + encrypted_data
 * @param {string} text - The JSON string to encrypt
 * @param {string} password - The shared secret password
 */
function encrypt(text, password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKey(password, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    // Combine all parts: salt(hex) + iv(hex) + tag(hex) + encrypted(hex)
    return JSON.stringify({
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        content: encrypted
    });
}

/**
 * Decrypts data
 * @param {string} encryptedDataString - The string produced by encrypt()
 * @param {string} password - The shared secret password
 */
function decrypt(encryptedDataString, password) {
    try {
        const data = JSON.parse(encryptedDataString);
        const salt = Buffer.from(data.salt, 'hex');
        const iv = Buffer.from(data.iv, 'hex');
        const tag = Buffer.from(data.tag, 'hex');
        const content = data.content;

        const key = getKey(password, salt);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        // console.error('Decryption failed:', error.message);
        throw new Error('Decryption failed. Wrong password or corrupted file.');
    }
}

module.exports = { encrypt, decrypt };
