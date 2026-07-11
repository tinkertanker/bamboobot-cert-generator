import { fireEvent, render, screen } from '@testing-library/react';
import { IndividualPdfsModal } from '@/components/modals/IndividualPdfsModal';

describe('IndividualPdfsModal large result lists', () => {
  it('virtualizes lists above 100 files', () => {
    const files = Array.from({ length: 150 }, (_, index) => ({
      filename: `server-${index}.pdf`,
      url: `/generated/server-${index}.pdf`,
      originalIndex: index
    }));
    const tableData = Array.from({ length: 150 }, (_, index) => ({
      Name: `Person ${index}`
    }));

    render(
      <IndividualPdfsModal
        isGeneratingIndividual={false}
        individualPdfsData={files}
        tableData={tableData}
        selectedNamingColumn="Name"
        setSelectedNamingColumn={jest.fn()}
        emailSendingStatus={{}}
        hasEmailColumn={false}
        emailConfig={{
          senderName: '',
          subject: '',
          message: '',
          deliveryMethod: 'download',
          isConfigured: false
        }}
        sendCertificateEmail={jest.fn()}
        setIndividualPdfsData={jest.fn()}
        detectedEmailColumn={null}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('Person_0.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Person_149.pdf')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Person_\d+\.pdf/).length).toBeLessThan(150);
  });

  it('uses the selected display filename for an individual email', () => {
    const sendCertificateEmail = jest.fn();
    render(
      <IndividualPdfsModal
        isGeneratingIndividual={false}
        individualPdfsData={[
          {
            filename: 'generated-name.pdf',
            url: '/generated/file.pdf',
            originalIndex: 0
          }
        ]}
        tableData={[{ Name: 'Ada Lovelace', Email: 'ada@example.com' }]}
        selectedNamingColumn="Name"
        setSelectedNamingColumn={jest.fn()}
        emailSendingStatus={{}}
        hasEmailColumn
        emailConfig={{
          senderName: 'Certificates',
          subject: 'Your certificate',
          message: 'Hello',
          deliveryMethod: 'attachment',
          isConfigured: true
        }}
        sendCertificateEmail={sendCertificateEmail}
        setIndividualPdfsData={jest.fn()}
        detectedEmailColumn="Email"
        onClose={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTitle('Send via email'));
    expect(sendCertificateEmail).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ filename: 'Ada_Lovelace.pdf' })
    );
  });
});
