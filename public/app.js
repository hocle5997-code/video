document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('tiktok-url');
    const pasteBtn = document.getElementById('paste-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const resultSection = document.getElementById('result-section');
    
    const videoCover = document.getElementById('video-cover');
    const videoDuration = document.getElementById('video-duration');
    const authorAvatar = document.getElementById('author-avatar');
    const authorName = document.getElementById('author-name');
    const authorUsername = document.getElementById('author-username');
    const videoTitle = document.getElementById('video-title');
    
    const downloadVideoBtn = document.getElementById('download-video');
    const downloadMuteBtn = document.getElementById('download-mute');
    const downloadAudioBtn = document.getElementById('download-audio');

    // Lưu trữ tạm thời link media để download
    let mediaData = {
        playUrl: '',
        musicUrl: '',
        title: '',
        author: ''
    };

    // Hàm Paste từ Clipboard
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            urlInput.value = text;
            urlInput.focus();
        } catch (err) {
            console.error('Không thể truy cập Clipboard: ', err);
            alert('Vui lòng cấp quyền truy cập Clipboard hoặc dán thủ công!');
        }
    });

    // Bắt sự kiện ấn phím Enter trong ô nhập liệu
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            analyzeVideo();
        }
    });

    // Bắt sự kiện click nút Phân tích
    analyzeBtn.addEventListener('click', analyzeVideo);

    // Hàm định dạng giây thành dạng mm:ss
    function formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Hàm gọi API phân tích
    async function analyzeVideo() {
        const url = urlInput.value.trim();
        
        if (!url) {
            showError('Vui lòng dán đường dẫn video TikTok hoặc Douyin!');
            return;
        }

        // Kiểm tra xem có đúng định dạng link tiktok hoặc douyin không
        const isTikTok = url.includes('tiktok.com');
        const isDouyin = url.includes('douyin.com');
        if (!isTikTok && !isDouyin) {
            showError('Đường dẫn không hợp lệ. Vui lòng nhập link TikTok hoặc Douyin!');
            return;
        }

        // Reset trạng thái UI
        hideError();
        resultSection.classList.add('hidden');
        loader.classList.remove('hidden');
        analyzeBtn.disabled = true;

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: url })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Lưu dữ liệu vào biến tạm
                mediaData.playUrl = result.data.play;
                mediaData.musicUrl = result.data.music;
                mediaData.title = result.data.title;
                mediaData.author = result.data.author.username;

                // Hiển thị thông tin lên UI
                videoCover.src = result.data.cover || 'https://placehold.co/160x220?text=No+Cover';
                videoDuration.textContent = formatDuration(result.data.duration);
                authorAvatar.src = result.data.author.avatar || 'https://placehold.co/48x48?text=Avatar';
                authorName.textContent = result.data.author.nickname;
                authorUsername.textContent = `@${result.data.author.username}`;
                videoTitle.textContent = result.data.title;

                // Hiển thị phần kết quả
                loader.classList.add('hidden');
                resultSection.classList.remove('hidden');
            } else {
                showError(result.error || 'Không thể lấy thông tin video. Vui lòng thử lại!');
                loader.classList.add('hidden');
            }
        } catch (error) {
            console.error('Lỗi khi phân tích: ', error);
            showError('Đã xảy ra lỗi kết nối đến server. Vui lòng thử lại sau!');
            loader.classList.add('hidden');
        } finally {
            analyzeBtn.disabled = false;
        }
    }

    // Thiết lập hành vi cho các nút tải về
    downloadVideoBtn.addEventListener('click', () => {
        if (!mediaData.playUrl) return;
        triggerDownload(mediaData.playUrl, 'video');
    });

    downloadMuteBtn.addEventListener('click', () => {
        if (!mediaData.playUrl) return;
        triggerDownload(mediaData.playUrl, 'mute');
    });

    downloadAudioBtn.addEventListener('click', () => {
        if (!mediaData.musicUrl) return;
        triggerDownload(mediaData.musicUrl, 'audio');
    });

    // Hàm kích hoạt tải file về thông qua server proxy
    function triggerDownload(streamUrl, type) {
        const downloadUrl = `/api/download?url=${encodeURIComponent(streamUrl)}&type=${type}&title=${encodeURIComponent(mediaData.title)}&author=${encodeURIComponent(mediaData.author)}`;
        
        // Tạo hiệu ứng tải xuống bằng việc điều hướng hoặc mở iframe ngầm
        // Vì server trả về Content-Disposition: attachment, trình duyệt sẽ tự động tải về thay vì chuyển trang
        window.location.href = downloadUrl;
    }

    // Các hàm phụ hiển thị trạng thái lỗi
    function showError(msg) {
        errorText.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }
});
