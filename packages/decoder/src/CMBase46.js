/*
* A special base64 format (╮°-°)╮┳━━┳ ( ╯°□°)╯ ┻━━┻
*/

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export default {
    decode(str) {
        let i
        let in_ = 0
        let char_array_3 = []
        let char_array_4 = []
        let out = new Buffer([])
        for (i = 0; str[in_] && str[in_] != '=';) {
            char_array_4[i++] = str[in_];
            in_++;
            if (i == 4) {
                for (i = 0; i < 4; i++) {
                    char_array_4[i] = B64_CHARS.indexOf(char_array_4[i]);
                }

                char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
                char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
                char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

                for (i = 0; (i < 3); i++) {
                    out = Buffer.concat([out, new Buffer([char_array_3[i]])])
                }
                i = 0;
            }
        }

        if (i) {
            let j = 0;

            for (j = i; j < 4; j++) {
                char_array_4[j] = 0;
            }

            for (j = 0; j < 4; j++) {
                char_array_4[j] = B64_CHARS.indexOf(char_array_4[j]);
            }
            char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
            char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
            char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

            for (j = 0; (j < i - 1); j++) {
                out = Buffer.concat([out, new Buffer([char_array_3[j]])])
            }
        }
        return out
    }
}