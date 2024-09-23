import axios from 'axios';
import FormData from 'form-data';

const API_URL = 'http://localhost:3000';
const EXAMPLE_TEMPLATE_URL_JPG = "https://tinkercademy.s3-ap-southeast-1.amazonaws.com/bgdark.jpeg";

async function uploadTemplate(url) {
  const response = await axios.get(url, { responseType: 'stream' });
  const form = new FormData();
  form.append('template', response.data, { filename: url.split('/').pop() });

  const response2 = await axios.post(`${API_URL}/api/upload`, form, {
    headers: {
      ...form.getHeaders(),
    },
  });

  console.log('Upload response:', response2.data);
  return {
    pdfFilename: response2.data.filename,
    imageUrl: response2.data.image, // Updated to get the image URL
  };
}

async function testGenerate(filename) {
  const response = await axios.post(`${API_URL}/api/generate`, {
    templateFilename: filename,
    data: [
      {
        name: {
          text: "John Doe",
          color: [0.7, 0.7, 0.7],
          bold: true,
          font: "Times"
        }, // Light Gray, Bold, Times
        course: {
          text: "Web Development",
          color: [1, 0.5, 0.5],
          bold: true,
          oblique: true,
          font: "Times"
        }, // Light Red, Bold Oblique, Times
        date: { text: "2023-05-01", color: [0.5, 0.5, 1], font: "Helvetica" } // Light Blue, Helvetica
      },
      {
        name: { text: "Jane Smith", color: [0.5, 1, 0.5], font: "Courier" }, // Light Green, Courier
        course: {
          text: "Data Science",
          color: [1, 0.8, 0.5],
          bold: true,
          font: "Courier"
        }, // Light Orange, Bold Courier
        date: {
          text: "2023-05-02",
          color: [0.7, 0.7, 0.7],
          oblique: true,
          font: "Courier"
        } // Light Gray, Courier Oblique
      },
      {
        name: {
          text: "Alice Johnson",
          color: [1, 1, 0],
          bold: true,
          oblique: true,
          font: "Times"
        }, // Yellow, Bold Oblique, Times
        course: { text: "Graphic Design", color: [0, 0, 1], font: "Helvetica" }, // Blue, Helvetica
        date: {
          text: "2023-05-03",
          color: [0.5, 0, 0.5],
          bold: true,
          font: "Helvetica"
        } // Purple, Bold Helvetica
      },
      {
        name: { text: "Bob Brown", color: [0, 1, 0], font: "Courier" }, // Green, Courier
        course: {
          text: "Machine Learning",
          color: [1, 0, 1],
          bold: true,
          oblique: true,
          font: "Courier"
        }, // Magenta, Bold Oblique Courier
        date: { text: "2023-05-04", color: [0, 0, 0], font: "Times" } // Black, Times
      }
    ],
    positions: {
      name: { x: 0.42, y: 0.6, fontSize: 36 },
      course: { x: 0.44, y: 0.5, fontSize: 24 },
      date: { x: 0.47, y: 0.4, fontSize: 12 }
    }
  });

  console.log("Generate response:", response.data);
}

async function runTest() {
  try {
    const { pdfFilename, imageUrl } = await uploadTemplate(EXAMPLE_TEMPLATE_URL_JPG);
    await testGenerate(pdfFilename);

    console.log("File name converted to PDF:", pdfFilename)
    console.log("Preview image URL:", imageUrl)
  } catch (error) {
    console.error('Test failed:', error.response ? error.response.data : error.message);
  }
}

runTest();
