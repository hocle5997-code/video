const express = require('express');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');

// Cấu hình đường dẫn FFmpeg (sử dụng FFmpeg hệ thống trên Hugging Face và static khi chạy local)
if (process.env.SPACE_ID || process.env.NODE_ENV === 'production') {
    console.log('[FFmpeg] Đang chạy trực tuyến (Hugging Face / Production). Sử dụng FFmpeg của hệ thống...');
} else {
    console.log('[FFmpeg] Đang chạy cục bộ (Local). Cấu hình sử dụng FFmpeg static...');
    ffmpeg.setFfmpegPath(ffmpegPath);
}

const app = express();
const PORT = process.env.PORT || 3000;
const DOUYIN_API_URL = process.env.DOUYIN_API_URL || 'https://api.douyin.wtf';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Hàm hỗ trợ làm sạch tên file để không chứa ký tự đặc biệt
function sanitizeFilename(name) {
    if (!name) return 'file';
    return name
        .normalize('NFD') // Loại bỏ dấu tiếng Việt
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_\-]/g, '_') // Thay thế ký tự đặc biệt bằng _
        .substring(0, 80); // Giới hạn độ dài tên file
}

// Hàm theo dõi redirect để phân giải link rút gọn (vt.tiktok.com, vm.tiktok.com, v.douyin.com)
async function resolveTikTokUrl(url) {
    try {
        console.log(`[Resolve] Đang phân giải link: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400
        });
        const finalUrl = response.request.res.responseUrl || response.config.url || url;
        console.log(`[Resolve] Link cuối cùng: ${finalUrl}`);
        return finalUrl;
    } catch (error) {
        console.error(`[Resolve Error] Không thể phân giải: ${error.message}`);
        return url; // Nếu lỗi thì giữ nguyên link gốc để gửi qua API
    }
}

// API phân tích link TikTok hoặc Douyin
app.post('/api/analyze', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'Vui lòng cung cấp link TikTok hoặc Douyin!' });
    }

    try {
        const resolvedUrl = await resolveTikTokUrl(url);
        const isDouyin = resolvedUrl.includes('douyin.com');

        if (isDouyin) {
            console.log(`[API Analyze] Nhận diện link Douyin, gửi request đến Douyin API: ${DOUYIN_API_URL}`);
            const apiResponse = await axios.get(`${DOUYIN_API_URL}/api/hybrid/video_data`, {
                params: { url: resolvedUrl },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            const result = apiResponse.data;
            const videoData = result.data || result;

            // Kiểm tra các trường dữ liệu phổ biến trả về từ Douyin_TikTok_Download_API
            const playUrl = videoData.nwm_video_url || videoData.video_url;

            if (playUrl) {
                console.log(`[API Analyze] Phân tích Douyin thành công video ID: ${videoData.aweme_id || videoData.video_id}`);
                return res.json({
                    success: true,
                    data: {
                        id: videoData.aweme_id || videoData.video_id || 'douyin_video',
                        title: videoData.video_title || videoData.desc || 'Douyin Video',
                        cover: videoData.video_cover_url || videoData.cover_url || '',
                        duration: videoData.video_duration || 0,
                        play: playUrl,
                        music: videoData.video_music_url || videoData.music_url || '',
                        author: {
                            nickname: videoData.video_author_nickname || videoData.author_nickname || 'Douyin Creator',
                            username: videoData.video_author_id || videoData.author_id || 'creator',
                            avatar: videoData.video_author_avatar_url || videoData.author_avatar_url || ''
                        }
                    }
                });
            } else {
                console.error(`[API Analyze Error] Douyin API phản hồi lỗi:`, result?.message || 'Không tìm thấy link video sạch');
                return res.status(422).json({ 
                    success: false, 
                    error: result?.message || 'Không thể phân tích dữ liệu video Douyin này. Vui lòng thử lại!' 
                });
            }
        } else {
            // Xử lý link TikTok như cũ
            console.log(`[API Analyze] Gửi request đến TikWM API cho link: ${resolvedUrl}`);
            const apiResponse = await axios.post('https://www.tikwm.com/api/', 
                new URLSearchParams({ url: resolvedUrl }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                }
            );

            const result = apiResponse.data;

            if (result && result.code === 0 && result.data) {
                console.log(`[API Analyze] Phân tích thành công video ID: ${result.data.id}`);
                return res.json({
                    success: true,
                    data: {
                        id: result.data.id,
                        title: result.data.title || 'TikTok Video',
                        cover: result.data.cover,
                        duration: result.data.duration,
                        play: result.data.play, // Link video gốc không watermark
                        music: result.data.music, // Link audio
                        author: {
                            nickname: result.data.author?.nickname || 'TikTok Creator',
                            username: result.data.author?.unique_id || 'creator',
                            avatar: result.data.author?.avatar
                        }
                    }
                });
            } else {
                console.error(`[API Analyze Error] TikWM phản hồi lỗi:`, result?.msg || 'Không có phản hồi hợp lệ');
                return res.status(422).json({ 
                    success: false, 
                    error: result?.msg || 'Không thể phân tích dữ liệu video này. Hãy kiểm tra lại link TikTok!' 
                });
            }
        }
    } catch (error) {
        console.error(`[API Analyze System Error]:`, error.message);
        return res.status(500).json({ 
            success: false, 
            error: 'Đã xảy ra lỗi hệ thống trong quá trình phân tích video!' 
        });
    }
});

// API download stream để phục vụ việc tải trực tiếp từ server
app.get('/api/download', async (req, res) => {
    const { url, type, title, author } = req.query;

    if (!url) {
        return res.status(400).send('Thiếu tham số url!');
    }

    const cleanTitle = sanitizeFilename(title);
    const cleanAuthor = sanitizeFilename(author);

    try {
        if (type === 'audio') {
            console.log(`[Download] Đang tải audio từ: ${url}`);
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            res.setHeader('Content-Disposition', `attachment; filename="[TikFlow]_${cleanAuthor}_${cleanTitle}.mp3"`);
            res.setHeader('Content-Type', 'audio/mpeg');
            response.data.pipe(res);

        } else if (type === 'mute') {
            console.log(`[Download Muted] Đang xử lý tách âm thanh từ: ${url}`);
            
            res.setHeader('Content-Disposition', `attachment; filename="[TikFlow]_${cleanAuthor}_${cleanTitle}_muted.mp4"`);
            res.setHeader('Content-Type', 'video/mp4');

            // Sử dụng fluent-ffmpeg để lấy video trực tuyến và loại bỏ âm thanh
            ffmpeg()
                .input(url)
                .inputOptions([
                    '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n'
                ])
                .noAudio()
                .videoCodec('copy') // Copy stream video trực tiếp để xử lý siêu tốc mà không encode lại
                .outputOptions([
                    '-movflags', 'frag_keyframe+empty_moov'
                ])
                .format('mp4')
                .on('start', (commandLine) => {
                    console.log(`[FFmpeg] Khởi chạy lệnh: ${commandLine}`);
                })
                .on('error', (err) => {
                    console.error('[FFmpeg Error]:', err.message);
                    if (!res.headersSent) {
                        res.status(500).send('Không thể xử lý video không âm thanh!');
                    }
                })
                .on('end', () => {
                    console.log('[FFmpeg] Hoàn thành tách âm thanh thành công!');
                })
                .pipe(res, { end: true });

        } else {
            // Tải video có âm thanh mặc định
            console.log(`[Download Video] Đang tải video từ: ${url}`);
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            res.setHeader('Content-Disposition', `attachment; filename="[TikFlow]_${cleanAuthor}_${cleanTitle}.mp4"`);
            res.setHeader('Content-Type', 'video/mp4');
            response.data.pipe(res);
        }
    } catch (error) {
        console.error(`[Download API Error]:`, error.message);
        if (!res.headersSent) {
            res.status(500).send('Không thể tải file từ link TikTok CDN!');
        }
    }
});

// Phục vụ giao diện chính
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 TikFlow Server is running at http://localhost:${PORT}`);
    console.log(`======================================================\n`);
});
