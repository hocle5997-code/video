# Sử dụng Node.js slim base image để tối ưu dung lượng
FROM node:20-slim

# Cài đặt ffmpeg hệ thống và git (phòng trường hợp cần thiết)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Sao chép package.json và package-lock.json
COPY package*.json ./

# Cài đặt dependencies
RUN npm install

# Sao chép toàn bộ mã nguồn dự án vào container
COPY . .

# Hugging Face Spaces chạy trên cổng mặc định 7860
ENV PORT=7860
EXPOSE 7860

# Lệnh khởi chạy server Express
CMD ["node", "server.js"]
