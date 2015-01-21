//depends on httpsync

function WFSClient(host,fsname,folder,config) {
	if (!folder) folder='';
	if (!config) config={};
	if (!config.file_types) config.file_types=[];
	if (!config.exclude) config.exclude=[];
	if (!('initialize' in config)) config.initialize=true;
	
	this.initialize=function() {initialize_folder_data();};
	this.readTextFile=function(path) {return _readTextFile(path);};
	this.writeTextFile=function(path,text) {return _writeTextFile(path,text);};
	this.readDir=function(path) {return _readDir(path);};
	this.loadFile=function(path) {return _loadFile(path);};
	this.saveFile=function(path,file_obj) {return _saveFile(path,file_obj);};
	this.loadArray=function(path) {return _loadArray(path);};
	this.loadNii=function(path) {return _loadNii(path);};
	
	var m_folder_data={files:[],dirs:[]};
	var m_base_url='http://'+host+'/wisdmfileserver';
	var m_written_text_files={};
	var m_initialized=false;
	if (config.initialize) {
		initialize_folder_data();
	}
	
	function initialize_folder_data() {
		var recursive='true';
		if (('recursive' in config)&&(!config.recursive)) recursive='false';
		var url=m_base_url+'/getFolderData?fsname='+fsname+'&path='+folder+'&file_types='+JSON.stringify(config.file_types);
		url+='&recursive='+recursive;
		m_folder_data=get_json(url);
		m_initialized=true;
	}
	
	function _readTextFile(path) {
		if (path in m_written_text_files) return m_written_text_files[path];
		var checksum=find_file_checksum(path);
		if (!checksum) return '';
		var url=m_base_url+'/getFileText?checksum='+checksum;
		return get_text(url);
	}
	function _writeTextFile(path,text) {
		var url=m_base_url+'/setFileData?fsname='+fsname+'&path='+append_paths(folder,path);
		var ret=post_text(url,text);
		if (ret.success) {
			m_written_text_files[path]=text;
			return true;
		}
		else {
			console.error('Error in writeTextFile: '+ret.error);
			return false;
		}
	}
	
	function _readDir(path) {
		var ret={files:[],dirs:[]};
		var DD=find_subfolder_data(path);
		if (!DD) return ret;
		for (var i in DD.files) {
			ret.files.push(DD.files[i].name);
		}
		for (var i in DD.dirs) {
			ret.dirs.push(DD.dirs[i].name);
		}
		return ret;
	}
	function _loadFile(path) {
		var checksum=find_file_checksum(path);
		if (!checksum) return null;
		var url=m_base_url+'/getFileData?checksum='+checksum;
		
		BEGIN_PROCESS bash [file X]=download_file(string url)
		PROCESSOR_ID ADRy9voF93PBk1si
		
		#download a file by url
		
		wget $url -O $X
		RC=$?
		if [ "$RC" = "0" ]; then
			echo "OK";
		else
			echo "wget FAILED";
			exit 1;
		fi
		
		END_PROCESS
		
		return X;
	}
	function _loadArray(path) {
		var checksum=find_file_checksum(path);
		if (!checksum) {
			console.error('checksum is null for: '+path);
			return null;
		}
		var url=m_base_url+'/getFileData?checksum='+checksum;
		
		BEGIN_PROCESS bash [mda X]=download_array(string url)
		PROCESSOR_ID downloadArrayADR
		
		#download a file by url
		
		wget $url -O $X
		RC=$?
		if [ "$RC" = "0" ]; then
			echo "OK";
		else
			echo "wget FAILED";
			exit 1;
		fi
		
		if [[ -s $X ]] ; then
			echo "File has data."
		else
			echo "File is empty."
			exit 1;
		fi ;
		
		END_PROCESS
		
		return X;
	}
	function _loadNii(path) {
		var checksum=find_file_checksum(path);
		if (!checksum) {
			console.error('checksum is null for: '+path);
			return null;
		}
		var url=m_base_url+'/getFileData?checksum='+checksum;
		
		BEGIN_PROCESS bash [nii X]=download_nii(string url)
		PROCESSOR_ID downloadNiiADRX2
		
		#download a file by url
		
		wget $url -O $X
		RC=$?
		if [ "$RC" = "0" ]; then
			echo "OK";
		else
			echo "wget FAILED";
			exit 1;
		fi
		
		if [[ -s $X ]] ; then
			echo "File has data."
		else
			echo "File is empty."
			exit 1;
		fi ;
		
		END_PROCESS
		
		return X;
	}
	function _saveFile(path,file_obj) {
		var checksum_url=m_base_url+'/getFileChecksum?fsname='+fsname+'&path='+append_paths(folder,path);
		var url=m_base_url+'/setFileData?fsname='+fsname+'&path='+append_paths(folder,path);
		var rand=Math.random();
		BEGIN_PROCESS bash []=upload_file(string checksum_url,string url,file file_obj,string rand)
		
		#upload a file by url
		wget -q $checksum_url -O checksum1.txt
		sha1sum $file_obj > checksum2.txt
		
		cat checksum1.txt
		echo ""
		cat checksum2.txt
		echo ""
		
		if [[ ! -z $(cat checksum1.txt) ]] && [[ $(cat checksum2.txt) == $(cat checksum1.txt)* ]]
		then
			#the checksums match, no need to do anything
			echo "checksums already match"
		else
			wget --post-file $file_obj $url -O output.txt
			RC=$?
			if [ "$RC" = "0" ]; then
				cat output.txt
			else
				echo "wget FAILED";
				exit 1;
			fi
		fi
		
		END_PROCESS												
	}
	function find_file_checksum(path) {
		if (m_initialized) {
			var file=find_file(m_folder_data,path);
			if (!file) return '';
			return file.checksum;
		}
		else {
			var url=m_base_url+'/getFileChecksum?fsname='+fsname+'&path='+append_paths(folder,path);
			return get_text(url);
		}
	}
	function find_file(data,path) {
		var ind1=path.indexOf('/');
		if (ind1<0) {
			for (var i in data.files) {
				if (data.files[i].name==path) return data.files[i];
			}
			return null;
		}
		else {
			var str1=path.slice(0,ind1);
			var str2=path.slice(ind1+1);
			for (var i in data.dirs) {
				if (data.dirs[i].name==str1) {
					return find_file(data.dirs[i].content,str2);
				}
			}
			return null;
		}
	}
	function find_subfolder_data(path) {
		return find_subfolder_data2(m_folder_data,path);
	}
	function find_subfolder_data2(data,path) {
		if (path==='') return data;
		var ind1=path.indexOf('/');
		if (ind1<0) {
			for (var i in data.dirs) {
				if (data.dirs[i].name==path) return data.dirs[i].content;
			}
			return null;
		}
		else {
			var str1=path.slice(0,ind1);
			var str2=path.slice(ind1+1);
			for (var i in data.dirs) {
				if (data.dirs[i].name==str1) {
					return find_subfolder_data2(data.dirs[i].content,str2);
				}
			}
			return null;
		}
	}
	
	function get_json(url) {
		var req=require('httpsync').request({url:url,method:'GET'});
		try {
			var ret=parse_response_data(req.end().data);
			return ret;
		}
		catch(err) {
			console.error(err.message);
			return {success:false,error:err.message};
		}
	}
	function get_text(url) {
		var req=require('httpsync').request({url:url,method:'GET'});
		try {
			var ret=response_data_to_string(req.end().data);
			return ret;
		}
		catch(err) {
			console.error(err.message);
			return '';
		}
	}
	function post_text(url,text) {
		var req=require('httpsync').request({url:url,method:'POST'});
		req.write(text);
		try {
			var ret=parse_response_data(req.end().data);
			return ret;
		}
		catch(err) {
			console.error(err.message);
			return {success:false,error:err.message};
		}
	}
	function parse_response_data(data) {
		var str=response_data_to_string(data);
		return JSON.parse(str);
	}
	function response_data_to_string(list) {
		if (!list) return '';
		var ret='';
		for (var i=0; i<list.length; i++) {
			ret+=String.fromCharCode(list[i]);
		}
		return ret;
	}
	function append_paths(path1,path2) {
		if (!path1) return path2;
		if (!path2) return path1;
		return path1+'/'+path2;
	}
}
