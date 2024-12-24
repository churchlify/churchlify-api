# Use official Node.js image as base
FROM node:22
# Set the working directory
WORKDIR /usr/src/app
# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install
# Copy the rest of the application files
COPY . .
ENV GOOGLE_APPLICATION_CREDENTIALS=service_account.json
# Expose the port the app will run on
EXPOSE 5500
# Command to run the app
CMD ["npm", "run", "api"]
